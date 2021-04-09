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
    const $firstBoard = createBoard();
    $('.row').append($firstBoard);

    $('body').on('click', '.board', ({currentTarget}) => {
        const $board = $(currentTarget);
        const $row = $board.closest('.row');
        const srcId = parseInt($board.attr('id'));

        const $newBoard = createBoard().attr('data-src', srcId)

        insertBoard($newBoard, $row);
        connectBoards();
    });

    document.addEventListener('scroll', ({target}) => {
        if ($(target).hasClass('row')) {
            connectBoards();
        }
    }, true);

    connectBoards();

    // $('.square').on('click', ({currentTarget}) => {
    //     const $square = $(currentTarget);
    //     const colIdx = $square.data('col-idx');
    //     const rowIdx = $square.closest('.board-row').data('row-idx');
    //     console.log(rowIdx, colIdx);
    // });

});

/* DOM methods */

function createBoard() {
    const $board = $(`<div class="board" id=${boards.length}></div>`);
    const $bishop = $('<i class="fa fa-chess-bishop"></i>');

    for (let i = 0; i < NUM_ROWS; i++) {
        const $row = $('<div></div>').attr('data-row-idx', i).addClass('board-row');
        for (let j = 0; j < NUM_COLS; j++) {
            const $square = $('<div></div>').attr('data-col-idx', j).addClass('square');
            const colIdx = j % NUM_COLS;
            if (colIdx === 0 || colIdx === NUM_COLS - 1) {
                $square.append($bishop.clone().addClass(colIdx === 0 ? 'black' : 'white'));
            }
            $row.append($square);
        }
        $board.append($row);
    }

    boards.push($board);
    return $board;
}

function insertBoard($newBoard, $row) {
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
            const newSrcIdx = getSrcIdx($newBoard);

            $rowBoards.each((idx, board) => {
                const $board = $(board);
                if (newSrcIdx < getSrcIdx($board)) {
                    $board.before($newBoard);
                    return false;
                } else if (idx === $rowBoards.length - 1) {
                    $nextRow.append($newBoard);
                }
            });
        } else {
            $nextRow.append($newBoard);
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