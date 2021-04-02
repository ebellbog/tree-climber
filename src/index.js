import './index.less';

// Important: keep in sync with values in index.less
const NUM_ROWS = 4; 
const NUM_COLS = 5;

$(document).ready(() => {
    setupBoards();
});

function setupBoards() {
    const $board = $('.board');
    for (let i = 0; i < NUM_ROWS * NUM_COLS; i++) {
        const $square = $('<div></div>').addClass('square');
        const $bishop = $('<i class="fa fa-chess-bishop"></i>');

        const colIdx = i % NUM_COLS;
        if (colIdx === 0 || colIdx === NUM_COLS - 1) {
            $square.append($bishop.clone().addClass(colIdx === 0 ? 'black' : 'white'));
        }
        $board.append($square);
    }

}