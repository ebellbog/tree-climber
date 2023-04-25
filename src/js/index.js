import '../less/index.less';

import BishopsBoard from './BishopsBoard';
import {gameSettings, globalState} from './shared';

import JungleLeaf from '../../img/jungle_leaf.svg';

import '../../img/monkey_icon.png';
import '../../img/GitHub-Mark-Light-64px.png';


/* Constants */

const BOARD_MARGIN = 12; // Vertical spacing between board top/bottom & branch endpoints


/* Globals */

const $svgLayer = $('#svg-layer');
const $allBranches = $('#all-branches');
const $allLeaves = $('#all-leaves');
const $allLabels = $('#all-labels');

const $stateGraph = $('#state-graph');

let scrollTop, scrollLeft;


/* Initialization & event hooks */

$(document).ready(() => {
    // Draw decorative leaves

    const $leaf = $(JungleLeaf).addClass('leaf');
    const $leaves = $('#jungle-leaves');
    ['light', 'medium', 'dark'].forEach((leafType) =>
        $leaves.append($leaf.clone().addClass(`${leafType}-leaf`)));

    // Hook up window events

    $(window)
        .on('resize', () => updateConnections())
        .on('orientationchange', () =>
            setTimeout(() => {
                updateLayout();
                updateScroll();
                updateConnections();
            }, 400)
        );

    $stateGraph.on('scroll', updateScroll);
    updateScroll();

    // Hook up custom events

    $('body')
        .on('update-layout', updateLayout)
        .on('update-leaves', updateLeafSpacing)
        .on('update-connections', (_e, data) => updateConnections(data?.connections))
        .on('scroll-to', (_e, {$board}) => scrollToBoard($board));

    // Hook up settings events

    $('#show-settings, #hide-settings').on('click', () => {
        $('body').toggleClass('show-settings');
        return false;
    });

    $('.toggle-btn').on('click', ({target}) => {
        $('.toggle-btn').removeClass('active');
        const toggle = $(target)
            .addClass('active')
            .data('toggle');

        $('.settings-content').hide();
        $(`#${toggle}`).show();
    });

    $('#show-moves').on('change', function() {
        gameSettings.showMoves = this.checked;
        $stateGraph.toggleClass('show-moves', gameSettings.showMoves);

        updateLeafSpacing();
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
        if (confirmChange(gameSettings.showPieces, $(this))) {
            gameSettings.showPieces = this.value;
            resetGame();
        }
    });
    $('#draw-branches').on('change', function() {
        gameSettings.drawBranches = this.checked;
        $stateGraph.toggleClass('tree-styling', gameSettings.drawBranches);
        updateConnections();
    });

    $('#num-rows').on('change', function() {
        const newRows = parseInt(this.value);
        if (newRows === gameSettings.numRows) return;

        if (confirmChange(gameSettings.numRows, $(this))) {
            gameSettings.numRows = newRows;
            resetGame();
        }
    });
    $('#num-cols').on('change', function() {
        const newCols = parseInt(this.value);
        if (newCols === gameSettings.numCols) return;

        if (confirmChange(gameSettings.numCols, $(this))) {
            gameSettings.numCols = newCols;
            resetGame();
        }
    });

    // Hook up toolbar buttons

    $('#reset-layout').on('click', () => {
        $stateGraph.find('.board-wrapper').css({left: 0, top: 0});
        updateLayout();
        updateScroll();
        updateConnections();
    });
    $('#reset-game').on('click', resetGame);

    // Hook up context menu

    $('body').on('click', () => {
        globalState.firstBoard.clearMenus();
    });

    // Reset & start game

    resetGame();

    // Handle device type

    if (!isMobileDevice()) {
        $('#show-moves, #show-stats').trigger('click');
        setTimeout(() => $('body').addClass('show-settings'), 250);
    }

    $('#state-graph').on('click', () => {
        if (isMobileDevice()) {
            $('body').removeClass('show-settings');
        }
    })
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

function updateLeafSpacing() {
    const showMoves =  $stateGraph.hasClass('show-moves');
    const leafOffset = (showMoves ? .2 : .33); // Spread out leaves when label is in between

    $allLeaves.find('.left-leaf + animateMotion').attr('keyPoints', `${1 - leafOffset};${1 - leafOffset}`);
    $allLeaves.find('.right-leaf + animateMotion').attr('keyPoints', `${leafOffset};${leafOffset}`);
}

function resetGame() {
    globalState.boards = {};
    globalState.connections = {};

    $stateGraph.find('.row:not(:first-child), .board-wrapper').remove();
    clearSvg();
    updateLayout();

    const newFirst = new BishopsBoard();

    newFirst.insertBoard($('.row:first-child'));
    newFirst.game.updatePriors();
    newFirst.renderStats();

    globalState.firstBoard = newFirst;
}

function confirmChange(oldValue, $el) {
    if (Object.keys(globalState.boards).length > 1 && !confirm('Changing this setting will reset the game. Are you sure you want to proceed?')) {
        $el.val(oldValue);
        return false;
    }
    return true;
}


/* Draw methods */

function clearSvg() {
    $allBranches.add($allLeaves).add($allLabels).empty();
}

function updateBranch({$branch}, {x: startX, y: startY}, {x: endX, y: endY}, controlDist = 40) {
    const coords = `M ${startX} ${startY} C ${startX} ${startY + controlDist}, ${endX} ${endY - controlDist}, ${endX} ${endY}`;
    return $branch.attr('d', coords);
}

function updateConnections(specificConnections) {
    (specificConnections || Object.values(globalState.connections)).forEach((c) => {
        const bottom = getBoardBottom(c.startBoard.$board);
        const top = getBoardTop(c.endBoard.$board);
        updateBranch(c, bottom, top);
    });
}


/* Utility methods */

function getBoardTop($board) {
    const {top, left} = $board.offset();
    const width = $board.outerWidth();

    return {
        x: left + scrollLeft + width/2,
        y: top + scrollTop - BOARD_MARGIN
    };
}

function getBoardBottom($board) {
    const {top, left} = $board.offset();
    const width = $board.outerWidth();
    const height = $board.outerHeight();

    return {
        x: left + scrollLeft + width/2,
        y: top + scrollTop + height + BOARD_MARGIN
    };
}

function scrollToBoard($board) {
    const $btnBar = $('#btn-bar');
    $stateGraph.scrollTop(getBoardTop($board).y - $btnBar.height());
}


function isMobileDevice() {
    return (navigator.userAgent.match(/Android/i)
        || navigator.userAgent.match(/webOS/i)
        || navigator.userAgent.match(/iPhone/i)
        || navigator.userAgent.match(/iPad/i)
        || navigator.userAgent.match(/iPod/i)
        || navigator.userAgent.match(/BlackBerry/i)
        || navigator.userAgent.match(/Windows Phone/i)
    ) ? true : false
}