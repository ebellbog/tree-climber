import './index.less';

const isMobile = () => Boolean(window.matchMedia("only screen and (max-device-width: 850px)").matches);

// Load assets dynamically
function loadAsset(el$, asset, attr = 'src') {
    el$.attr(attr, `${asset}`);
}

function randInt(min, max) {
    return Math.round(Math.random() * (max - min)) + min;
}

// Important: keep in sync with values in index.less
const NUM_ROWS = 4; 
const NUM_COLS = 5;

$(document).ready(() => {
    const $board = $('.board');
    for (let i = 0; i < NUM_ROWS * NUM_COLS; i++) {
        const $square = $('<div></div>').addClass('square');
        $board.append($square);
    }
});