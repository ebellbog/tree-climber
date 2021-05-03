import './index.less';

/* Constants */

const MARGIN = 12;

const LABEL_WIDTH = 78;
const LABEL_HEIGHT = 24;
const LABEL_RADIUS = 12;

/* Globals */

const $svgLayer = $('#svg-layer');
const $stateGraph = $('#state-graph');

let numRows = 4;
let numCols = 5;
let showPieces = 'all';

let scrollTop, scrollLeft;
let boards, connections, firstBoard;

/* Initialization & event hooks */

$(document).ready(() => {
    resetGame();

    $(window).on('resize', () => updateConnections());

    $stateGraph.on('scroll', updateScroll);
    updateScroll();

    $('#show-settings, #hide-settings').on('click', () => {
        $('body').toggleClass('show-settings');
        return false;
    });

    $('#show-moves').on('change', function() {
        $stateGraph.toggleClass('show-moves', this.checked);
        updateLayout();
        updateScroll();
        updateConnections();
    });
    $('#show-stats').on('change', function() {
        $stateGraph.toggleClass('show-stats', this.checked);
        updateLayout();
        updateScroll();
        updateConnections();
    });
    $('#show-pieces').on('change', function() {
        showPieces = this.value;
        resetGame();
    });

    $('#num-rows').on('change', function() {
        const newRows = parseInt(this.value);
        if (newRows !== numRows) {
            numRows = newRows;
            resetGame();
        }
    });
    $('#num-cols').on('change', function() {
        const newCols = parseInt(this.value);
        if (newCols !== numCols) {
            numCols = newCols;
            resetGame();
        }
    });

    $('#reset-layout').on('click', () => {
        $stateGraph.find('.board-wrapper').css({left: 0, top: 0});
        updateLayout();
        updateScroll();
        updateConnections();
    });
    $('#reset-game').on('click', resetGame);

    $('body').on('click', function({target}) {
        $('.context-menu').hide();
        if ($(target).closest('#settings').length) return;
        $(this).removeClass('show-settings');
    });
});

// Cache these values for a very minor optimization when dragging
function updateScroll() {
    scrollTop = $stateGraph.scrollTop();
    scrollLeft = $stateGraph.scrollLeft();
}

function updateLayout() {
    $svgLayer.css({width: '100%', height: '100%'});
    $svgLayer.css({
        width: $stateGraph[0].scrollWidth,
        height: $stateGraph[0].scrollHeight,
    });
}

function resetGame() {
    boards = {};
    connections = {};

    $stateGraph.find('.row:not(:first-child), .board-wrapper').remove();
    $svgLayer.empty()
    updateLayout();

    firstBoard = new BishopsBoard({rows: numRows, cols: numCols, pieces: showPieces});
    firstBoard.insertBoard($('.row:first-child'));

    firstBoard.game.updatePriors();
    firstBoard.renderStats();
}

/* DOM methods */

class BishopsBoard {
    constructor({rows, cols, pieces, src}) {
        this.$board = null;
        this.$stats = null;
        this.$menu = null;

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
            this.game = new BishopsGame({rows, cols, pieces});
        }

        this.game.analyzeGame();
        this.renderGame();

        boards[this.game.hash] = this;

        this.hookEvents();
    }

    initBoard(rows, cols) {
        this.$board = $(`<div class="board" id="b${Object.keys(boards).length}"></div>`);
        this.$stats = $('<div class="board-stats"></div>');
        this.$menu = $('.context-menu:last').clone();

        this.$boardWrapper = $('<div class="board-wrapper"></div>').append(this.$board, this.$stats, this.$menu);

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
                if ($square.is('.prior-connected-move, .prior-explored-move')) {
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
            .on('contextmenu', (e) => {
                e.preventDefault();
                this.dragging = false;

                $('.context-menu').hide();

                const $target = $(e.target);
                const {offsetX, offsetY} = e
                const {top, left} = $target.position();

                this.$menu.css({
                    display: 'block',
                    left: offsetX + left,
                    top: offsetY + top
                });
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
                const $destSquare = $(currentTarget);
                const move = [this.selectedSquare, this.getCoords($destSquare)];
                this.expandMoves([move]);
            })
            .on('click', '.prior-explored-move', ({currentTarget}) => {
                const $square = $(currentTarget);
                const targetCoords = this.getCoords($square);

                const priorHash = $square.attr('data-prior');
                const priorBoard = boards[priorHash];

                // Create two-way link between games
                this.game.connectGame(priorBoard.game);
                priorBoard.game.connectGame(this.game);

                // Update priors
                [this, priorBoard].forEach((board) => {
                    board.game.updatePriors();
                    board.renderStats();
                });

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

                const key = this.getConnectionKey(this, priorBoard);
                connections[key] = {
                    startBoard,
                    startLabel,
                    endBoard,
                    endLabel
                };

                drawConnections();
            })
            .on('mousedown', (e) => {
                this.dragging = {x: e.pageX, y: e.pageY};
            })
            .on('mousemove', (e) => {
                if (this.dragging) {
                    this.$boardWrapper.css({
                        left: `+=${e.pageX - this.dragging.x}`,
                        top: `+=${e.pageY - this.dragging.y}`
                    });
                    this.dragging = {x: e.pageX, y: e.pageY};
                    updateConnections();
                }
            })
            .on('mouseup', () => {
                this.dragging = false;
                updateLayout();
            });

        this.$menu.on('click', '.menu-option', ({target}) => {
            switch($(target).data('action')) {
                case 'expand':
                    this.expandMoves(this.game.getAllValidMoves());
                    break;
                case 'hint':
                    break;
                case 'solve':
                    setTimeout(() => {
                        const winningMoves = this.game.solveGame();
                        if (!winningMoves) {
                            console.log("couldn't solve");
                            return;
                        }

                        let lastBoard = this;
                        winningMoves.forEach((move) => {
                            lastBoard = lastBoard.expandMoves([move])[0];
                        });
                    }, 0);
                    break;
                default:
                    break;
            }
            this.$menu.hide();
            return false;
        })

        $('body').on('click', () => this.clearSelection());
    }

    clearSelection() {
        this.selectedSquare = null;

        const classesToRemove = ['valid-move', 'invalid-move', 'prior-connected-move', 'prior-explored-move', 'prior', 'selected'];
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

            if (type.includes('prior')) {
                $moveSquare.attr('data-prior', move.result);
            }
        });
    }

    insertBoard($row) {
        // Inserting the first board
        if (!$row.children().length) {
            return $row.append(this.$boardWrapper);
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
                    $board.closest('.board-wrapper').before(this.$boardWrapper);
                    return false; // break
                } else if (idx === $rowBoards.length - 1) {
                    $nextRow.append(this.$boardWrapper);
                }
            });
        } else {
            $nextRow.append(this.$boardWrapper);
        }

        updateLayout();
    }

    expandMoves(moves) {
        const newBoards = [];
        moves.forEach((move) => {
            const newBoard = new BishopsBoard({src: {board: this, move}});
            newBoard.insertBoard(this.getRow());
            newBoards.push(newBoard);

            this.game.connectGame(newBoard.game);

            const key = this.getConnectionKey(this, newBoard);
            connections[key] = {
                startBoard: this,
                startLabel: this.formatCoords(...move[0]),
                endBoard: newBoard,
                endLabel: this.formatCoords(...move[1])
            };
        })

        firstBoard.game.updateSequence();
        Object.values(boards).forEach((board) => {
            board.game.updatePriors();
            board.renderStats();
        });

        drawConnections();
        return newBoards;
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
        const solvedRatio = `${this.game.solvedPieces} / ${this.game.totalPieces}`;

        const connectionsRatio = `${this.game.exploredOptions} / ${this.game.totalOptions}`;
        const connectionsClass =  (this.game.connectedOptions < this.game.exploredOptions) ? 'missing-connection' :
            (this.game.exploredOptions === this.game.totalOptions) ? 'complete' : '';

        this.$stats.html(
            `<div class="stats-row"><i class="fa fa-fw fa-hashtag"></i> &nbsp;${this.game.index}</div>` +
            `<div class="stats-row"><i class="fa fa-fw fa-star"></i> &nbsp;${solvedRatio}</div>` +
            `<div class="stats-row ${connectionsClass}"><i class="fas fa-fw fa-project-diagram"></i> &nbsp;${connectionsRatio}</div>`
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
    constructor({rows, cols, pieces, src}) {
        this.state = [];

        this.connectedGames = {};
        this.lastMove = null;
        this.index = 0;

        this.solvedPieces = 0;
        this.totalPieces = 0;

        this.connectedOptions = 0;
        this.exploredOptions = 0;
        this.totalOptions = 0;

        if (src) {
            const {game, move} = src;
            this.state = JSON.parse(JSON.stringify(game.state));
            this.applyMove(move);
            this.connectedGames[game.hash] = game;
        } else {
            this.initializeGame(rows, cols, pieces);
        }
    }

    initializeGame(rows, cols, pieces) {
        const getSquareColor = (r, c) => ((rows - r) + (cols - c)) % 2 ? 'white' : 'black';
        const getBishopColor = (r, c) => (c === 0) ? 'black' : (c === cols - 1) ? 'white' : null;

        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                row.push({
                    attackedBy: {
                        white: false,
                        black: false
                    },
                    moveOptions: [],
                    occupiedBy: (pieces === 'all' || getSquareColor(r, c) === pieces) ? getBishopColor(r, c) : null
                });
            }
            this.state.push(row);
        }
    };

    analyzeGame() {
        this.solvedPieces = 0;
        this.totalPieces = 0;

        // Reset attack flags
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.state[r][c].attackedBy = {
                    white: false,
                    black: false
                };
            };
        };

        // First pass: get move options, flag squares as attacked, count solved pieces
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const square = this.state[r][c];
                const {occupiedBy} = square;
                if (occupiedBy) {
                    this.totalPieces++;

                    // Count bishops that have successfully traversed the board
                    if (
                        (occupiedBy === 'white' && c === 0) ||
                        (occupiedBy === 'black' && c === this.cols - 1)
                    ) this.solvedPieces++;

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

    solveGame() {
        const history = Object.values(boards).reduce((acc, board) => Object.assign(acc, {[board.game.hash]: 'null'}), {});

        let leaves = [this];
        let layer = 0;
        let winningMoves;

        console.time('solve');

        while (leaves.length && !winningMoves) {
            const newLeaves = [];
            for (let i = 0; i < leaves.length; i++) {
                const possibleGames = leaves[i].getPossibleGames();
                for (let j = 0; j < possibleGames.length; j++) {
                    const game = possibleGames[j];
                    if (history[game.hash]) continue;
                    game.analyzeGame();
                    newLeaves.push(game);
                    history[game.hash] = `${history[leaves[i].hash]}, ${JSON.stringify(game.lastMove)}`;
                    if (game.solvedPieces === game.totalPieces) {
                        winningMoves = history[game.hash];
                        break;
                    }
                }
            }
            leaves = newLeaves;
            layer++;
        }

        console.timeEnd('solve');

        return (winningMoves) ? JSON.parse(`[${winningMoves}]`).slice(1) : false;
    }

    getAllValidMoves() {
        const validMoves = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const {moveOptions} = this.state[r][c];
                const moves = moveOptions
                    .filter((move) => move.type === 'valid')
                    .map((move) => [[r, c], [move.row, move.col]]);
                validMoves.push(...moves);
            }
        }
        return validMoves;
    }

    getPossibleGames() {
        return this.getAllValidMoves().map((move) => new BishopsGame({src: {game: this, move}}));
    }

    connectGame(game) {
        this.connectedGames[game.hash] = game;
    }

    updateSequence() {
        // Special behavior for first game: reset all other indices before calculating
        if (this.index === 0) {
            Object.values(boards)
                .filter(({game}) => game !== this)
                .forEach(({game}) => game.index = -1);
        }

        const gamesToVisit = Object.values(this.connectedGames).filter((game) => game.index === -1 || game.index > this.index + 1);
        gamesToVisit.forEach((game) => game.index = this.index + 1);
        gamesToVisit.forEach((game) => game.updateSequence()); // recurse
    }

    // Mark valid move options as prior, if they lead to a game state that already exists; count unexplored options
    updatePriors() {
        this.connectedOptions = 0;
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
                            this.exploredOptions++;
                            if (this.connectedGames[move.result]) {
                                this.connectedOptions++;
                                move.type = 'prior-connected';
                            } else {
                                move.type = 'prior-explored';
                            }
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
        this.lastMove = move;
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

function updateConnections(specificConnections) {
    (specificConnections || Object.values(connections)).forEach((c) => {
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

    return {
        x: left + scrollLeft + width/2,
        y: top + scrollTop - MARGIN
    };
}

function getBoardBottom($board) {
    const {top, left} = $board.offset();
    const width = $board.outerWidth();
    const height = $board.outerHeight();

    return {
        x: left + scrollLeft + width/2,
        y: top + scrollTop + height + MARGIN
    };
}

function getMidpoint(start, end) {
    return {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
}