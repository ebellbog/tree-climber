import './index.less';

const NUM_ROWS = 4; 
const NUM_COLS = 5;

$(document).ready(() => {
    setupBoards();
});

function setupBoards() {
    const $board = $('.board');
    const $bishop = $('<i class="fa fa-chess-bishop"></i>');

    for (let i = 0; i < NUM_ROWS; i++) {
        const $row = $('<div></div>').addClass('board-row');
        for (let j = 0; j < NUM_COLS; j++) {
            const $square = $('<div></div>').addClass('square');
            const colIdx = j % NUM_COLS;
            if (colIdx === 0 || colIdx === NUM_COLS - 1) {
                $square.append($bishop.clone().addClass(colIdx === 0 ? 'black' : 'white'));
            }
            $row.append($square);
        }
        $board.append($row);
    }
}