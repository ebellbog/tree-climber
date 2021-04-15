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

const boards = [];
const connections = [];

let showCoords = false;

/* Initialization & event hooks */

$(document).ready(() => {
    const firstBoard = new BishopsBoard({rows: NUM_ROWS, cols: NUM_COLS});
    firstBoard.insertBoard($('.row'));

    document.addEventListener('scroll', ({target}) => { // Can't listen via jQuery because scroll events don't bubble up
        if ($(target).hasClass('row')) {
            connectBoards();
        }
    }, true);

    $(window).on('keypress', ({which}) => {
        if (which === 32) {
            showCoords = !showCoords;
            $('#state-graph').toggleClass('no-borders', !showCoords);
            connectBoards();
        }
    });
});

/* DOM methods */

class BishopsBoard {
    constructor({rows, cols, src}) {
        this.selectedSquare = null;
        this.$board = null;


        if (src) {
            const {board, move} = src;
            const {game} = board;

            this.initBoard(game.rows, game.cols);
            this.$board.attr('data-src', board.id);

            this.game = new BishopsGame({src: {game, move}});
        } else {
            this.initBoard(rows, cols);
            this.game = new BishopsGame({rows, cols});
        }

        this.game.analyzeGame();
        this.renderGame();

        this.hookEvents();
        boards.push(this.$board);
    }

    initBoard(rows, cols) {
        this.$board = $(`<div class="board" id=${boards.length}></div>`);

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
                if (this.selectedSquare) {
                    return;
                }
                this.highlightMoves($(currentTarget));
            })
            .on('mouseout', '.square', () => {
                if (this.selectedSquare) {
                    return;
                }
                this.clearSelection();
            })
            .on('click', '.square.white, .square.black', (e) => {
                e.stopPropagation();
                this.clearSelection();

                const $square = $(e.currentTarget);
                $square.addClass('selected');
                this.selectedSquare = this.getCoords($square);

                this.highlightMoves($square);
            })
            .on('click', '.valid-move', ({currentTarget}) => {
                const destSquare = this.getCoords($(currentTarget));
                const move = [this.selectedSquare, destSquare];

                const newBoard = new BishopsBoard({src: {board: this, move}});
                connections.push({
                    $startBoard: this.$board,
                    startLabel: this.formatCoords(...this.selectedSquare),
                    $endBoard: newBoard.$board,
                    endLabel: this.formatCoords(...destSquare)
                });

                const $row = this.$board.closest('.row');
                newBoard.insertBoard($row);

                connectBoards();
            })

        $('body').on('click', () => this.clearSelection());
    }

    clearSelection() {
        this.selectedSquare = null;
        this.$board.find('.valid-move, .invalid-move, .selected').removeClass('valid-move invalid-move selected');
    }

    highlightMoves($square) {
        const [row, col] = this.getCoords($square);

        const {moveOptions, occupiedBy} = this.game.state[row][col];
        moveOptions.forEach(([r, c]) => {
            const $moveSquare = this.getSquare(r, c);
            const {attackedBy} = this.game.state[r][c];
            $moveSquare.addClass(attackedBy[oppositeColor(occupiedBy)] ? 'invalid-move' : 'valid-move');
        });
    }

    insertBoard($row) {
        // Inserting the first board
        if (!$row.children().length) {
            return $row.append(this.$board);
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
                    $board.before(this.$board);
                    return false;
                } else if (idx === $rowBoards.length - 1) {
                    $nextRow.append(this.$board);
                }
            });
        } else {
            $nextRow.append(this.$board);
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

    getSquare(row, col) {
        return this.$board.find(`[data-row="${row}"]`).find(`[data-col="${col}"]`);
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

    get id() {
        return this.$board.attr('id');
    }
}

/* Game logic */

class BishopsGame {
    constructor({rows, cols, src}) {
        this.state = [];

        if (src) {
            const {game, move} = src;
            this.state = JSON.parse(JSON.stringify(game.state));
            this.applyMove(move);
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
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const square = this.state[r][c];
                const {occupiedBy} = square;
                if (occupiedBy) {
                    square.moveOptions = this.findBishopMoves(r, c);
                    for (let m = 0; m < square.moveOptions.length; m++) {
                        const [mR, mC] = square.moveOptions[m];
                        this.state[mR][mC].attackedBy[occupiedBy] = true;
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
                        moves.push([newRow, newCol]);
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
        return this.state.map((row) => row.map((square) => square.occupiedBy || '-').join('')).join('');
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

function drawBezier({x: startX, y: startY}, {x: endX, y: endY}, controlDist = 40) {
    const path = createSvg('path');
    $(path)
        .attr('d', `M ${startX} ${startY} C ${startX} ${startY + controlDist}, ${endX} ${endY - controlDist}, ${endX} ${endY}`)
        // .css('filter', 'url(#dropshadow)')
        .appendTo($svgLayer);
}

function drawEllipse({x, y}, rX = 5, rY = 5, color = 'white') {
    const ellipse = createSvg('ellipse');
    $(ellipse)
        .attr('cx', x)
        .attr('cy', y)
        .attr('rx', rX)
        .attr('ry', rY)
        .attr('fill', color)
        .appendTo($svgLayer);
}

function drawRect({x, y}, width, height, radius = 0, color = 'white') {
    const rect = createSvg('rect');
    $(rect)
        .attr('x', x)
        .attr('y', y)
        .attr('width', width)
        .attr('height', height)
        .attr('rx', radius)
        .attr('fill', color)
        .appendTo($svgLayer);
}

function drawText({x, y}, content) {
    const text = createSvg('text');
    $(text)
        .attr('x', x)
        .attr('y', y)
        .html(content)
        .appendTo($svgLayer);
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

function connectBoards() {
    clearSvg();
    const labels = [];
    connections.forEach(({$startBoard, $endBoard, startLabel, endLabel}) => {
        const bottom = getBoardBottom($startBoard);
        const top = getBoardTop($endBoard);
        drawBezier(bottom, top);

        if (showCoords) {
            labels.push({
                midpoint: getMidpoint(bottom, top),
                startLabel,
                endLabel
            });
        }
    });

    labels.forEach(({midpoint, startLabel, endLabel}) => {
        drawRect(
            {x: midpoint.x - LABEL_WIDTH / 2, y: midpoint.y - LABEL_HEIGHT / 2},
            LABEL_WIDTH, LABEL_HEIGHT, LABEL_RADIUS
        );
        drawText(midpoint, `${startLabel} → ${endLabel}`);
    });
}

/* Utility methods */
function oppositeColor(color) {
    return (color === 'white') ? 'black' : 'white';
}