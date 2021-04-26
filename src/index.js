import './index.less';

/* Constants */

const NUM_ROWS = 4;
const NUM_COLS = 5;

const MARGIN = 12;

const LABEL_WIDTH = 78;
const LABEL_HEIGHT = 24;
const LABEL_RADIUS = 12;

/* Globals */

const $svgLayer = $('#svg-layer');

const boards = {};
const connections = {};
let firstBoard = null;

/* Initialization & event hooks */

$(document).ready(() => {
    firstBoard = new BishopsBoard({rows: NUM_ROWS, cols: NUM_COLS});
    firstBoard.insertBoard($('.row'));

    firstBoard.game.updatePriors();
    firstBoard.renderStats();

    document.addEventListener('scroll', ({target}) => { // Can't listen via jQuery because scroll events don't bubble up
        if ($(target).hasClass('row')) {
            updateConnections();
        }
    }, true);

    $(window)
        .on('keypress', ({which}) => {
            if (which === 32) {
                $('#state-graph').toggleClass('show-moves');
                updateConnections();
            } else if (which === 13) {
                $('#state-graph').toggleClass('show-stats');
                updateConnections();
            }
        })
        .on('resize', updateConnections);

    $('.settings-btn').on('click', () => {
        $('body').toggleClass('show-settings');
    });
});

/* DOM methods */

class BishopsBoard {
    constructor({rows, cols, src}) {
        this.$board = null;
        this.$stats = null;

        this.selectedSquare = null;
        this.dragging = false;

        if (src) {
            const {board, move} = src;
            const {game} = board;

            this.initBoard(game.rows, game.cols);
            this.$board.attr('data-src', board.id); // used for inserting boards in a reasonable order (see insertBoard)

            this.game = new BishopsGame({src: {game, move}});
        } else {
            this.initBoard(rows, cols);
            this.game = new BishopsGame({rows, cols});
        }

        this.game.analyzeGame();
        this.renderGame();

        this.hookEvents();

        boards[this.game.hash] = this;
    }

    initBoard(rows, cols) {
        this.$board = $(`<div class="board" id="b${Object.keys(boards).length}"></div>`);
        this.$stats = $('<div class="board-stats"></div>');

        for (let r = -1; r <= rows; r++) {
            const $row = $('<div></div>');
            if (r > -1 && r < rows) {
                $row.attr('data-row', r).addClass('board-row');
            }
            for (let c = -1; c <= cols; c++) {
                const $square = $('<div></div>');
                if (r === -1 || r === rows || c === -1 || c === cols) { // Borders
                    const coord = ((r === -1 || r === rows)  && c > -1 && c < cols) ? cols - c : // Numeric indices
                        ((c === -1 || c === cols) && r > -1 && r < rows) ? String.fromCharCode(96 + rows - r) : // Alphabetic indices
                        '';
                    $square.addClass('border-square').html(`<div class="coord">${coord}</div>`);
                } else {
                    $square.attr('data-col', c).addClass('square');
                }
                $row.append($square);
            }
            this.$board.append($row);
        }
    }

    hookEvents() {
        this.$board
            .on('mouseover', '.square', ({currentTarget}) => {
                const $square = $(currentTarget);
                if ($square.hasClass('prior-move')) {
                    const priorHash = $square.attr('data-prior');
                    const priorBoard = boards[priorHash];
                    const key = this.getConnectionKey(this, priorBoard);
                    priorBoard.$board.add($svgLayer.find(`.${key}`)).addClass('prior');
                }
                if (this.selectedSquare) {
                    return;
                }
                this.highlightMoves($(currentTarget));
            })
            .on('mouseout', '.square', () => {
                if (this.selectedSquare) {
                    $('.prior').removeClass('prior');
                    return;
                }
                this.clearSelection();
            })
            .on('click', '.square.white, .square.black', (e) => { // i.e. an occupied square
                e.stopPropagation();

                const $square = $(e.currentTarget);

                const previouslySelected = $square.hasClass('selected');
                this.clearSelection();
                if (previouslySelected) return; // toggle selection on successive clicks

                $square.addClass('selected');
                this.selectedSquare = this.getCoords($square);

                this.highlightMoves($square);
            })
            .on('click', '.valid-move', ({currentTarget}) => {
                const destSquare = this.getCoords($(currentTarget));
                const move = [this.selectedSquare, destSquare];

                const newBoard = new BishopsBoard({src: {board: this, move}});
                newBoard.insertBoard(this.getRow());
                this.game.connectedGames.push(newBoard.game);

                firstBoard.game.updateSequence();
                Object.values(boards).forEach((board) => {
                    board.game.updatePriors();
                    board.renderStats();
                });

                const key = this.getConnectionKey(this, newBoard);
                connections[key] = {
                    startBoard: this,
                    startLabel: this.formatCoords(...this.selectedSquare),
                    endBoard: newBoard,
                    endLabel: this.formatCoords(...destSquare)
                };

                drawConnections();
            })
            .on('click', '.prior-move', ({currentTarget}) => {
                const $square = $(currentTarget);
                const targetCoords = this.getCoords($square);

                const priorHash = $square.data('prior');
                const priorBoard = boards[priorHash];

                const key = this.getConnectionKey(this, priorBoard);
                if (connections[key]) return; // connection already established

                // Create two-way link between games
                this.game.connectedGames.push(priorBoard.game);
                priorBoard.game.connectedGames.push(this.game);

                // Re-sequence games based on new connections
                firstBoard.game.updateSequence();
                Object.values(boards).forEach((board) => board.renderStats());

                const rowIdx = this.getRowIdx();
                const priorIdx = this.getRowIdx(priorBoard.$board);

                // Determine start & end based on row order, from top to bottom
                let startBoard, startLabel, endBoard, endLabel;
                if (rowIdx > priorIdx) {
                    startBoard = priorBoard;
                    startLabel = this.formatCoords(...targetCoords);
                    endBoard = this;
                    endLabel = this.formatCoords(...this.selectedSquare);
                } else {
                    startBoard = this;
                    startLabel = this.formatCoords(...this.selectedSquare);
                    endBoard = priorBoard;
                    endLabel = this.formatCoords(...targetCoords);
                }

                connections[key] = {
                    startBoard,
                    startLabel,
                    endBoard,
                    endLabel
                };

                drawConnections();
            })
            .on('mousedown', (e) => {
                this.dragging = e.pageX;
            })
            .on('mousemove', (e) => {
                if (this.dragging) {
                    const deltaX = e.pageX - this.dragging;
                    this.$board.add(this.$stats).css('left', `+=${deltaX}`);
                    this.dragging = e.pageX;
                    updateConnections();
                }
            })
            .on('mouseup', () => {
                this.dragging = false;
            });

        $('body').on('click', () => this.clearSelection());
    }

    clearSelection() {
        this.selectedSquare = null;

        const classesToRemove = ['valid-move', 'invalid-move', 'prior-move', 'selected', 'prior'];
        $('body')
            .find(classesToRemove.map((c) => `.${c}`).join(','))
            .removeClass(classesToRemove.join(' '));
    }

    highlightMoves($square) {
        const [row, col] = this.getCoords($square);

        const {moveOptions, occupiedBy} = this.game.state[row][col];
        moveOptions.forEach((move) => {
            const $moveSquare = this.getSquare(move.row, move.col);

            const {type} = move;
            $moveSquare.addClass(`${type}-move`);

            if (type === 'prior') {
                $moveSquare.attr('data-prior', move.result);
            }
        });
    }

    insertBoard($row) {
        const $wrappedBoard = $('<div class="board-wrapper"></div>').append(this.$board, this.$stats);

        // Inserting the first board
        if (!$row.children().length) {
            return $row.append($wrappedBoard);
        }

        let $nextRow = $row.next('.row');
        if (!$nextRow.length) {
            $nextRow = $('<div class="row"></div>');
            $row.after($nextRow);
        }

        const $rowBoards = $nextRow.find('.board');
        if ($rowBoards.length) {
            const $srcBoards = $row.find('.board');
            const srcIds = $srcBoards.toArray().map((board) => $(board).attr('id'));

            const getSrcIdx = ($board) => srcIds.indexOf($board.attr('data-src'));
            const srcIdx = getSrcIdx(this.$board);

            $rowBoards.each((idx, board) => {
                const $board = $(board);
                if (srcIdx < getSrcIdx($board)) {
                    $board.closest('.board-wrapper').before($wrappedBoard);
                    return false; // break
                } else if (idx === $rowBoards.length - 1) {
                    $nextRow.append($wrappedBoard);
                }
            });
        } else {
            $nextRow.append($wrappedBoard);
        }
    }

    renderGame() {
        const $bishop = $('<i class="fa fa-chess-bishop"></i>');
        const {state, rows, cols} = this.game;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const {occupiedBy} = state[r][c];
                if (occupiedBy) {
                    this.getSquare(r, c).addClass(occupiedBy).append($bishop.clone());
                }
            }
        }
    }

    renderStats() {
        this.$stats.html(
            `<div class="stats-row"><i class="fa fa-fw fa-hashtag"></i> &nbsp;${this.game.index}</div>` +
            `<div class="stats-row"><i class="fas fa-fw fa-project-diagram"></i> &nbsp;${this.game.exploredOptions} / ${this.game.totalOptions}</div>`
        );
    }

    getSquare(row, col) {
        return this.$board.find(`[data-row="${row}"]`).find(`[data-col="${col}"]`);
    }

    getRow($board) {
        return ($board || this.$board).closest('.row');
    }

    getRowIdx($board) {
        return this.getRow($board).index();
    }

    getCoords($square) {
        const col = $square.data('col');
        const row = $square.closest('.board-row').data('row');
        return [row, col];
    }

    formatCoords(r, c) {
        const formattedRow = String.fromCharCode(96 + this.game.rows - r);
        const formattedCol = this.game.cols - c;
        return `${formattedRow}${formattedCol}`;
    }

    getConnectionKey({$board: $board1}, {$board: $board2}) {
        // Ensure a consistent ordering of IDs, regardless of which board initiates the connection
        return [$board1, $board2]
            .sort(($b1, $b2) => this.getRowIdx($b1) > this.getRowIdx($b2) ? 1 : -1)
            .map(($b) => $b.attr('id'))
            .join('');
    }

    get id() {
        return this.$board.attr('id');
    }
}

/* Game logic */

class BishopsGame {
    constructor({rows, cols, src}) {
        this.state = [];

        this.connectedGames = [];
        this.index = 0;

        this.exploredOptions = 0;
        this.totalOptions = 0;

        if (src) {
            const {game, move} = src;
            this.state = JSON.parse(JSON.stringify(game.state));
            this.applyMove(move);
            this.connectedGames.push(game);
        } else {
            this.initializeGame(rows, cols);
        }
    }

    initializeGame(rows, cols) {
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                row.push({
                    attackedBy: {
                        white: false,
                        black: false
                    },
                    moveOptions: [],
                    occupiedBy: (c === 0) ? 'black' : (c === cols - 1) ? 'white' : null
                });
            }
            this.state.push(row);
        }
    };

    analyzeGame() {
        // Reset attack flags
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.state[r][c].attackedBy = {
                    white: false,
                    black: false
                };
            };
        };

        // First pass: get move options, flag squares as attacked
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const square = this.state[r][c];
                const {occupiedBy} = square;
                if (occupiedBy) {
                    square.moveOptions = this.findBishopMoves(r, c);
                    for (let m = 0; m < square.moveOptions.length; m++) {
                        const move = square.moveOptions[m];
                        this.state[move.row][move.col].attackedBy[occupiedBy] = true;
                    }
                }
            }
        }

        // Second pass: using attack flags from above, mark move options as valid / invalid
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const {occupiedBy, moveOptions} = this.state[r][c];
                for (let m = 0; m < moveOptions.length; m++) {
                    const move = moveOptions[m];
                    const moveSquare = this.state[move.row][move.col];
                    move.type = moveSquare.attackedBy[oppositeColor(occupiedBy)] ? 'invalid' : 'valid';
                }
            }
        }
    }

    updateSequence() {
        // Special behavior for first game: reset all other indices before calculating
        if (this.index === 0) {
            Object.values(boards)
                .filter(({game}) => game !== this)
                .forEach(({game}) => game.index = -1);
        }

        const gamesToVisit = this.connectedGames.filter((game) => game.index === -1 || game.index > this.index + 1);
        gamesToVisit.forEach((game) => game.index = this.index + 1);
        gamesToVisit.forEach((game) => game.updateSequence()); // recurse
    }

    // Mark valid move options as prior, if they lead to a game state that already exists; count unexplored options
    updatePriors() {
        this.exploredOptions = 0;
        this.totalOptions = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const {moveOptions} = this.state[r][c];
                for (let m = 0; m < moveOptions.length; m++) {
                    const move = moveOptions[m];
                    if (!move.result) {
                        const possibleGame = new BishopsGame({src: {game: this, move: [[r, c], [move.row, move.col]]}});
                        move.result = possibleGame.hash;
                    }
                    if (move.type !== 'invalid') {
                        this.totalOptions++;
                        if (boards[move.result]) {
                            move.type = 'prior';
                            this.exploredOptions++;
                        }
                    }
                }
            }
        }
    }

    findBishopMoves(row, col) {
        const isInBounds = (row, col) => {
            return (
                row >= 0 && row < this.rows &&
                col >= 0 && col < this.cols
            );
        }

        const moves = [];

        // Search outwards, breaking when an obstacle is encountered (or bounds are exceeded)
        for (let rowDirection = -1; rowDirection < 2; rowDirection += 2) {
            for (let colDirection = -1; colDirection < 2; colDirection += 2) {
                for (let dist = 1; dist < Math.max(this.rows, this.cols); dist++) {
                    const newRow = row + (dist * rowDirection);
                    const newCol = col + (dist * colDirection);
                    if (isInBounds(newRow, newCol) && !this.state[newRow][newCol].occupiedBy) {
                        moves.push({row: newRow, col: newCol});
                    } else {
                        break;
                    }
                }
            }
        }

        return moves;
    }

    applyMove(move) {
        const [[r1, c1], [r2, c2]] = move;
        const {occupiedBy} = this.state[r1][c1];
        Object.assign(this.state[r1][c1], {
            occupiedBy: null,
            moveOptions: []
        });
        Object.assign(this.state[r2][c2], {
            occupiedBy
        });
    }

    get hash() {
        return this.state
            .map((row) => row
                .map(({occupiedBy}) => (occupiedBy || '-')[0])
                .join(''))
            .join('');
    }
    get rows() {
        return this.state.length;
    }
    get cols() {
        return this.state[0].length;
    }
}

/* Draw methods */

function clearSvg() {
    $svgLayer.empty();
}

function createSvg(element) {
    return document.createElementNS('http://www.w3.org/2000/svg', element);
}

function drawBezier(start, end, controlDist = 40) {
    const path = createSvg('path');
    return updateBezier($(path), start, end, controlDist).appendTo($svgLayer);
}
function updateBezier($path, {x: startX, y: startY}, {x: endX, y: endY}, controlDist = 40) {
    const coords = `M ${startX} ${startY} C ${startX} ${startY + controlDist}, ${endX} ${endY - controlDist}, ${endX} ${endY}`;
    return $path.attr('d', coords);
}

function drawEllipse({x, y}, rX = 5, rY = 5, color = 'white') {
    const ellipse = createSvg('ellipse');
    return $(ellipse)
        .attr('cx', x)
        .attr('cy', y)
        .attr('rx', rX)
        .attr('ry', rY)
        .attr('fill', color)
        .appendTo($svgLayer);
}

function drawRect(coords, width, height, radius = 0, color = 'white') {
    const rect = createSvg('rect');
    return updateRect($(rect), coords)
        .attr('width', width)
        .attr('height', height)
        .attr('rx', radius)
        .attr('fill', color)
        .appendTo($svgLayer);
}
function updateRect($rect, {x, y}) {
    return $rect
        .attr('x', x)
        .attr('y', y);
}

function drawText(coords, content) {
    const text = createSvg('text');
    return updateText($(text), coords)
        .html(content)
        .appendTo($svgLayer);
}
function updateText($text, {x, y}) {
    return $text
        .attr('x', x)
        .attr('y', y);
}

function drawConnections() {
    clearSvg();
    const labels = [];
    Object.entries(connections).forEach(([key, {startBoard, startLabel, endBoard, endLabel}]) => {
        const bottom = getBoardBottom(startBoard.$board);
        const top = getBoardTop(endBoard.$board);

        const $path = drawBezier(bottom, top).addClass(key);
        connections[key].$path = $path;

        const indexDelta = endBoard.game.index - startBoard.game.index;
        labels.push({
            key,
            startLabel,
            endLabel,
            direction: (indexDelta > 0) ? '→' : (indexDelta === 0) ? '–' : '←',
            midpoint: getMidpoint(bottom, top)
        });
    });

    // Draw labels on top of connections (z-index won't work)
    labels.forEach(({key, startLabel, endLabel, direction, midpoint}) => {
        connections[key].$rect = drawRect(
            {x: midpoint.x - LABEL_WIDTH / 2, y: midpoint.y - LABEL_HEIGHT / 2},
            LABEL_WIDTH, LABEL_HEIGHT, LABEL_RADIUS
        ).addClass(key);
        connections[key].$text = drawText(midpoint, `${startLabel} ${direction} ${endLabel}`).addClass(key);
    });
}

function updateConnections() {
    Object.values(connections).forEach((c) => {
        const bottom = getBoardBottom(c.startBoard.$board);
        const top = getBoardTop(c.endBoard.$board);
        const midpoint = getMidpoint(bottom, top);

        updateBezier(c.$path, bottom, top);
        updateText(c.$text, midpoint);
        updateRect(c.$rect, {x: midpoint.x - LABEL_WIDTH / 2, y: midpoint.y - LABEL_HEIGHT / 2});
    });
}

/* Utility methods */

function oppositeColor(color) {
    return (color === 'white') ? 'black' : 'white';
}

function getBoardTop($board) {
    const {top, left} = $board.offset();
    const width = $board.outerWidth();
    const height = $board.outerHeight();
    return {x: left + width/2, y: top - MARGIN};
}

function getBoardBottom($board) {
    const {top, left} = $board.offset();
    const width = $board.outerWidth();
    const height = $board.outerHeight();
    return {x: left + width/2, y: top + height + MARGIN}
}

function getMidpoint(start, end) {
    return {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
}