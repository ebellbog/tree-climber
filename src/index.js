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
    const firstBoard = new BishopsBoard(NUM_ROWS, NUM_COLS);
    boards.push(firstBoard.$board);
    $('.row').append(firstBoard.$board);

    $('body').on('click', '.board', ({currentTarget}) => {
        const $board = $(currentTarget);
        const $row = $board.closest('.row');
        const srcId = parseInt($board.attr('id'));

        const newBoard = new BishopsBoard(NUM_ROWS, NUM_COLS, srcId);
        newBoard.insertBoard($row);
        boards.push(newBoard.$board);

        connectBoards();
    });

    // Can't listen via jQuery because scroll events don't bubble up
    document.addEventListener('scroll', ({target}) => {
        if ($(target).hasClass('row')) {
            connectBoards();
        }
    }, true);

    connectBoards();
});

/* DOM methods */

class BishopsBoard {
    constructor(rows, cols, srcId) {
        this.initBoard(rows, cols);
        if (srcId !== null) {
            this.$board.attr('data-src', srcId);
        }

        this.game = new BishopsGame(rows, cols);
        this.renderGame();

        this.hookEvents();
    }

    initBoard(rows, cols) {
        this.$board = $(`<div class="board" id=${boards.length}></div>`);

        for (let r = 0; r < rows; r++) {
            const $row = $('<div></div>').attr('data-row-idx', r).addClass('board-row');
            for (let c = 0; c < cols; c++) {
                const $square = $('<div></div>').attr('data-col-idx', c).addClass('square');
                $row.append($square);
            }
            this.$board.append($row);
        }
    }

    hookEvents() {
        this.$board.on('mouseover', '.square', ({currentTarget}) => {
            const $square = $(currentTarget);
            const colIdx = $square.data('col-idx');
            const rowIdx = $square.closest('.board-row').data('row-idx');
            console.log(rowIdx, colIdx);
        });
    }

    insertBoard($row) {
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
        const {gameState, rows, cols} = this.game;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const {occupiedBy} = gameState[r][c];
                if (occupiedBy) {
                    this.getSquare(r, c).append($bishop.clone().addClass(occupiedBy));
                }
            }
        }
    }

    getSquare(row, col) {
        return this.$board.find(`[data-row-idx="${row}"]`).find(`[data-col-idx="${col}"]`);
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

/* Game logic */

class BishopsGame {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;

        this.initializeGame();
    }

    initializeGame() {
        this.gameState = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            for (let c = 0; c < this.cols; c++) {
                row.push({
                    attackedBy: {
                        white: false,
                        black: false
                    },
                    moveOptions: [],
                    occupiedBy: (c === 0) ? 'black' : (c === this.cols - 1) ? 'white' : null
                });
            }
            this.gameState.push(row);
        }
    };

    analyzeGame() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const square = this.gameState[r][c];
                const {occupiedBy} = square;
                if (occupiedBy) {
                    square.moveOptions = this.getBishopMoves(r, c);
                    for (let m = 0; m < square.moveOptions.length; m++) {
                        const [mR, mC] = square.moveOptions[m];
                        this.gameState[mR][mC].attackedBy[occupiedBy] = true;
                    }
                }
            }
        }
    }

    getBishopMoves(row, col) {
        const moves = [];
        for (let c = 0; c < this.cols; c++) {
            if (c === col) continue;
            const dist = Math.abs(col - c);
            if (row - dist >= 0) {
                moves.push([row - dist, c]);
            }
            if (row + dist < this.rows) {
                moves.push([row + dist, c]);
            }
        }
        return moves;
    }

    getHash() {
        return this.gameState.map((row) => row.map((square) => square.occupiedBy || '-').join('')).join('');
    }
}