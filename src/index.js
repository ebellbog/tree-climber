import './index.less';

/* Constants */

const NUM_ROWS = 4; 
const NUM_COLS = 5;

const MARGIN = 10;

/* Globals */

const $curves = $('#curves');
const boards = [];

/* Initialization & event hooks */

$(document).ready(() => {
    const firstBoard = new BishopsBoard({rows: NUM_ROWS, cols: NUM_COLS});
    firstBoard.insertBoard($('.row'));

    document.addEventListener('scroll', ({target}) => { // Can't listen via jQuery because scroll events don't bubble up
        if ($(target).hasClass('row')) {
            connectBoards();
        }
    }, true);
    connectBoards();
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

        for (let r = 0; r < rows; r++) {
            const $row = $('<div></div>').attr('data-row', r).addClass('board-row');
            for (let c = 0; c < cols; c++) {
                const $square = $('<div></div>').attr('data-col', c).addClass('square');
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
                this.selectedSquare = this.getCoordinates($square);

                this.highlightMoves($square);
            })
            .on('click', '.valid-move', ({currentTarget}) => {
                const destSquare = this.getCoordinates($(currentTarget));
                const move = [this.selectedSquare, destSquare];

                const newBoard = new BishopsBoard({src: {board: this, move}});

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
        const [row, col] = this.getCoordinates($square);

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

    getCoordinates($square) {
        const col = $square.data('col');
        const row = $square.closest('.board-row').data('row');
        return [row, col];
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
    $curves.find('path').remove();
}

function drawBezier({x: startX, y: startY}, {x: endX, y: endY}, controlDist = 40) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    $(path)
        .attr('d', `M ${startX} ${startY} C ${startX} ${startY + controlDist}, ${endX} ${endY - controlDist}, ${endX} ${endY}`)
        // .css('filter', 'url(#dropshadow)')
        .appendTo($curves);
}

function drawCircle({x, y}, radius = 5, color = 'white') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    $(circle)
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', radius)
        .attr('fill', color)
        .appendTo($curves);
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

function connectBoards() {
    clearSvg();
    boards.forEach(($board) => {
        const src = $board.attr('data-src');
        if (src) {
            const $srcBoard = $(`#${src}`);
            drawBezier(getBoardBottom($srcBoard), getBoardTop($board));
        }
    });
}

/* Utility methods */
function oppositeColor(color) {
    return (color === 'white') ? 'black' : 'white';
}