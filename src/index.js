import './index.less';
import JungleLeaf from '../img/jungle_leaf.svg';
import VineLeaf from '../img/vine_leaf.svg';

/* Constants */

const BOARD_MARGIN = 12; // Vertical spacing between board top/bottom & branch endpoints
const TREE_MARGIN = 10; // Spacing around solution tree in canvas preview
const SOLUTION_TREE_DELAY = 850; // Milliseconds between expanding successive moves of solution

/* Globals */

const $svgLayer = $('#svg-layer');
const $allBranches = $('#all-branches');
const $allLeaves = $('#all-leaves');
const $allLabels = $('#all-labels');

const $stateGraph = $('#state-graph');

let numRows = 4;
let numCols = 5;
let showPieces = 'all';
let showMoves = false;
let drawBranches = true;

let scrollTop, scrollLeft;
let boards, connections, firstBoard;

/* Initialization & event hooks */

$(document).ready(() => {
    // Draw decorative leaves
    const $leaf = $(JungleLeaf).addClass('leaf');
    const $leaves = $('#jungle-leaves');
    ['light', 'medium', 'dark'].forEach((leafType) =>
        $leaves.append($leaf.clone().addClass(`${leafType}-leaf`)));

    resetGame();

    $(window).on('resize', () => updateConnections());

    $stateGraph.on('scroll', updateScroll);
    updateScroll();

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
        showMoves = this.checked;
        $stateGraph.toggleClass('show-moves', showMoves);

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
        showPieces = this.value;
        resetGame();
    });
    $('#draw-branches').on('change', function() {
        drawBranches = this.checked;
        $stateGraph.toggleClass('tree-styling', drawBranches);
        updateConnections();
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

    $('body').on('click', () => {
        $('.context-menu').hide();
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

function updateLeafSpacing() {
    const showMoves =  $stateGraph.hasClass('show-moves');
    const leafOffset = (showMoves ? .2 : .33); // Spread out leaves when label is in between

    $allLeaves.find('.left-leaf + animateMotion').attr('keyPoints', `${1 - leafOffset};${1 - leafOffset}`);
    $allLeaves.find('.right-leaf + animateMotion').attr('keyPoints', `${leafOffset};${leafOffset}`);
}

function resetGame() {
    boards = {};
    connections = {};

    $stateGraph.find('.row:not(:first-child), .board-wrapper').remove();
    clearSvg();
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
        this.$loadingIndicator = null;

        this.selectedSquare = null;
        this.dragging = false;
        this.myConnections = [];

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
        this.$loadingIndicator = $('<canvas class="loading-indicator"></canvas>');
        this.$board.append(this.$loadingIndicator);

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
            .on('click', '.valid-move, .prior-explored-move', ({currentTarget}) => {
                const $destSquare = $(currentTarget);
                const move = [this.selectedSquare, this.getCoords($destSquare)];
                this.expandMoves([move]);
            })
            .on('mousedown', (e) => {
                this.myConnections = this.getMyConnections();
                this.dragging = {x: e.pageX, y: e.pageY};
            })
            .on('mousemove', (e) => {
                if (this.dragging) {
                    this.$boardWrapper.css({
                        left: `+=${e.pageX - this.dragging.x}`,
                        top: `+=${e.pageY - this.dragging.y}`
                    });
                    this.dragging = {x: e.pageX, y: e.pageY};
                    updateConnections(this.myConnections);
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
                    this.$loadingIndicator.addClass('is-loading');
                    this.game.solveGame(this.$loadingIndicator, (winningMoves) => {
                        setTimeout(() => {
                            this.$loadingIndicator.removeClass('is-loading')
                            if (winningMoves) this.expandMoves([winningMoves[0]]);
                        }, SOLUTION_TREE_DELAY);
                    });
                    break;
                case 'solve':
                    this.$loadingIndicator.addClass('is-loading');
                    this.game.solveGame(this.$loadingIndicator, (winningMoves) => {
                        setTimeout(() => {
                            this.$loadingIndicator.removeClass('is-loading')

                            if (!winningMoves) return;

                            let index = 0, board = this;
                            const delayedExpand = () => {
                                board = board.expandMoves([winningMoves[index]])[0];
                                $stateGraph.scrollTop(getBoardTop(board.$board).y - $('#btn-bar').height());
                                index++;
                                if (index < winningMoves.length) setTimeout(() => delayedExpand(), 700);
                            };
                            delayedExpand(this);
                        }, SOLUTION_TREE_DELAY);
                    });
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
        const expandedBoards = [], newConnections = [];
        moves.forEach((move) => {
            const {hash} = new BishopsGame({src: {game: this.game, move}});
            if (boards[hash]) {
                const priorBoard = boards[hash];
                expandedBoards.push(priorBoard);

                // Create two-way link between games
                this.game.connectGame(priorBoard.game);
                priorBoard.game.connectGame(this.game);

                const rowIdx = this.getRowIdx();
                const priorIdx = this.getRowIdx(priorBoard.$board);

                // Determine start & end based on row order, from top to bottom
                let startBoard, startLabel, endBoard, endLabel;
                if (rowIdx > priorIdx) {
                    startBoard = priorBoard;
                    startLabel = this.formatCoords(...move[1]);
                    endBoard = this;
                    endLabel = this.formatCoords(...move[0]);
                } else {
                    startBoard = this;
                    startLabel = this.formatCoords(...move[0]);
                    endBoard = priorBoard;
                    endLabel = this.formatCoords(...move[1]);
                }

                const key = this.getConnectionKey(this, priorBoard);
                connections[key] = {
                    startBoard,
                    startLabel,
                    endBoard,
                    endLabel
                };
                newConnections[key] = connections[key]

                priorBoard.$board.toggleClass('extra-pop');
            } else {
                const newBoard = new BishopsBoard({src: {board: this, move}});

                newBoard.insertBoard(this.getRow());
                expandedBoards.push(newBoard);

                this.game.connectGame(newBoard.game);

                const key = this.getConnectionKey(this, newBoard);
                connections[key] = {
                    startBoard: this,
                    startLabel: this.formatCoords(...move[0]),
                    endBoard: newBoard,
                    endLabel: this.formatCoords(...move[1])
                };
                newConnections[key] = connections[key]
            }
        });

        firstBoard.game.updateSequence();
        Object.values(boards).forEach((board) => {
            board.game.updatePriors();
            board.renderStats();
        });

        addConnections(newConnections);
        updateConnections();
        updateLabels();

        return expandedBoards;
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
        const solvedClass = (this.game.solvedPieces === this.game.totalPieces) ? 'solved' : '';

        const connectionsRatio = `${this.game.exploredOptions} / ${this.game.totalOptions}`;
        const connectionsClass =  (this.game.connectedOptions < this.game.exploredOptions) ? 'missing-connection' :
            (this.game.exploredOptions === this.game.totalOptions) ? 'complete' : '';

        this.$stats.html(
            `<div class="stats-row"><i class="fa fa-fw fa-hashtag"></i> &nbsp;${this.game.index}</div>` +
            `<div class="stats-row ${solvedClass}"><i class="fa fa-fw fa-star"></i> &nbsp;${solvedRatio}</div>` +
            `<div class="stats-row ${connectionsClass}"><i class="fas fa-fw fa-project-diagram"></i> &nbsp;${connectionsRatio}</div>`
        );

        const remainingOptions = this.game.totalOptions - this.game.exploredOptions;
        const $expand = this.$menu.find('[data-action="expand"]');
        $expand
            .toggle(remainingOptions > 0)
            .html(`Make ${remainingOptions} remaining move${remainingOptions !== 1 ? 's' : ''}`);
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

    getMyConnections() {
        return Object.keys(connections)
            .filter((key) => key.includes(this.id))
            .map((key) => connections[key]);
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
        this.history = [];

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

    solveGame($canvas, callback) {
        // Don't "backtrace" to games in this game's own history
        const moveHistory = this.history.concat(this.hash)
            .reduce((acc, hash) => Object.assign(acc, {[hash]: '[]'}), {});

        let winningMoves, leaves = [this];
        const tree = [
            [{children: []}]
        ];

        const solveNextLayer = () => {
            if (!leaves.length) return callback(false);

            const newLeaves = [];
            let treeIndex = 0;
            for (let i = 0; i < leaves.length; i++) {
                const possibleGames = leaves[i].getPossibleGames();
                for (let j = 0; j < possibleGames.length; j++) {
                    const possibleGame = possibleGames[j];
                    if (moveHistory[possibleGame.hash]) continue; // If already exists in solution history, this isn't the shortest path

                    possibleGame.analyzeGame();

                    newLeaves.push(possibleGame);

                    tree[tree.length - 1][i].children.push(treeIndex);
                    treeIndex++;

                    moveHistory[possibleGame.hash] = `${moveHistory[leaves[i].hash]}, ${JSON.stringify(possibleGame.lastMove)}`; // Accumulate moves

                    if (possibleGame.solvedPieces === possibleGame.totalPieces && !winningMoves) {
                        winningMoves = moveHistory[possibleGame.hash];
                        // Technically, we could return here, but the visualization looks nicer if we finish analyzing the layer
                    }
                }
            }

            tree.push(newLeaves.map((leaf) => ({children: []})));
            sketchTree($canvas, tree);

            if (winningMoves) {
                return callback(JSON.parse(`[${winningMoves}]`).slice(1));
            }

            leaves = newLeaves;
            window.requestAnimationFrame(solveNextLayer);
        }

        solveNextLayer();
    }

    getAllValidMoves(includePriors = false) {
        const validTypes = ['valid'];
        if (includePriors) validTypes.push('prior-connected', 'prior-explored');

        const validMoves = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const {moveOptions} = this.state[r][c];
                const moves = moveOptions
                    .filter((move) => validTypes.includes(move.type))
                    .map((move) => [[r, c], [move.row, move.col]]);
                validMoves.push(...moves);
            }
        }
        return validMoves;
    }

    getPossibleGames() {
        return this.getAllValidMoves(true).map((move) => new BishopsGame({src: {game: this, move}}));
    }

    connectGame(game) {
        this.connectedGames[game.hash] = game;
    }

    updateSequence() {
        // Special behavior for first game: reset all other indices before calculating
        if (this.index === 0) {
            Object.values(boards)
                .filter(({game}) => game !== this)
                .forEach(({game}) => game.history = false);
        }

        const gamesToVisit = Object.values(this.connectedGames).filter((game) => game.index === false || game.index > this.index + 1);
        gamesToVisit.forEach((game) => game.history = [...this.history, this.hash]);
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
    get index() {
        return this.history ? this.history.length : false;
    }
}

/* Draw methods */

function createSvg(element) {
    return document.createElementNS('http://www.w3.org/2000/svg', element);
}
function clearSvg() {
    $allBranches.add($allLeaves).add($allLabels).empty();
}

function addBranch(key) {
    const $branchGroup = $('#svg-templates .branch-group').clone().appendTo($allBranches);
    const $branch = $branchGroup.find('.branch').attr('id', key);
    const $vineLeaf = $(VineLeaf).find('path');

    $branchGroup
        .find('.branch, .branch-leaf, .label-bg, .label-text')
        .addClass(key); // Add key class to support highlighting prior connections
    $branchGroup
        .find('mpath')
        .attr('xlink:href', `#${key}`);
    $branchGroup
        .find('.leaf-group')
        .clone()
        .appendTo($branchGroup)
        .find('.branch-leaf')
        .removeClass('left-leaf').addClass('right-leaf');
    $branchGroup
        .find('.branch-leaf')
        .attr('d', $vineLeaf.attr('d'));
    $branchGroup
        .find('.leaf-group')
        .detach()
        .appendTo($allLeaves);

    const $label = $branchGroup
        .find('.label-group').detach().appendTo($allLabels).find('.label-text');

    updateLeafSpacing();
    return {$branch, $label};
}
function updateBranch({$branch}, {x: startX, y: startY}, {x: endX, y: endY}, controlDist = 40) {
    const coords = `M ${startX} ${startY} C ${startX} ${startY + controlDist}, ${endX} ${endY - controlDist}, ${endX} ${endY}`;
    return $branch.attr('d', coords);
}

function addConnections(newConnections) {
    Object.entries(newConnections).forEach(([key, connection]) => {
        Object.assign(connection, addBranch(key));
    });
}
function updateConnections(specificConnections) {
    (specificConnections || Object.values(connections)).forEach((c) => {
        const bottom = getBoardBottom(c.startBoard.$board);
        const top = getBoardTop(c.endBoard.$board);
        updateBranch(c, bottom, top);
    });
}

function updateLabels() {
    Object.values(connections).forEach(({startBoard, startLabel, endBoard, endLabel, $label}) => {
        const indexDelta = endBoard.game.index - startBoard.game.index;
        const direction = (indexDelta > 0) ? '→' : (indexDelta === 0) ? '–' : '←';
        $label.html(`${startLabel} ${direction} ${endLabel}`);
    });
}

/* Canvas methods */

function sketchTree($sketch, treeData) {
    const width = 2 * firstBoard.$board.innerWidth();
    const height = 2 * firstBoard.$board.innerHeight();
    $sketch.attr({width, height});

    const sketchCtx= $sketch[0].getContext('2d');
    sketchCtx.clearRect(0, 0, width, height);

    // Calculate coordinates & draw

    const maxSize = Math.max(...(treeData).map((row) => row.length));

    const SIZE_THRESHOLD = 150;
    sketchCtx.lineWidth = (maxSize > SIZE_THRESHOLD) ? 1 : 2;

    for (let t = 0; t < treeData.length; t++) {
        const treeRow = treeData[t];

        const rowHeight = TREE_MARGIN + t * ((height - 2 * TREE_MARGIN) / (treeData.length - 1));
        const nodeCount = treeRow.length;

        let x, spacing;
        if (nodeCount === 1) {
            x = width / 2;
        } else {
            spacing = Math.min((width - 2 * TREE_MARGIN) / (nodeCount - 1), width / 4);
            const rowWidth = spacing * (nodeCount - 1);
            x = (width - 2 * TREE_MARGIN - rowWidth) / 2 + TREE_MARGIN;
        }

        for (let l = 0; l < nodeCount; l++) {
            const node = treeRow[l];
            node.y = rowHeight;
            node.x = x;
            x += spacing;
        }

        if (t > 0) {
            const prevRow = treeData[t-1];
            prevRow.forEach((node) => node.children.forEach((c, idx) => {
                const child = treeRow[c];
                child.x = (3 * node.x + child.x) / 4; // weight positions towards parent

                sketchCtx.strokeStyle = `hsl(${110 + 250 * idx / node.children.length}, 90%, 60%)`;
                drawLine(sketchCtx, node, child)

                if (maxSize < SIZE_THRESHOLD) {
                    sketchCtx.fillStyle = sketchCtx.strokeStyle;
                    drawPoint(sketchCtx, child);
                    if (t === 1 && idx === 0) {
                        drawPoint(sketchCtx, node); // mark root
                    }
                }
            }));
        }
    }
}

function drawPoint(ctx, {x, y}, r = 3) {
    ctx.globalCompositeOperation='source-over';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawLine(ctx, {x: startX, y: startY}, {x: endX, y: endY}) {
    ctx.globalCompositeOperation='destination-over';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

/* Utility methods */

function oppositeColor(color) {
    return (color === 'white') ? 'black' : 'white';
}

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