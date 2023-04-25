import {gameSettings, globalState} from './shared';

import BishopsGame from './BishopsGame';
import BoardStatsTemplate from '../html/templates/BoardStats.handlebars';

import VineLeaf from '../../img/vine_leaf.svg';


/* Constants */

const SOLUTION_TREE_DELAY = 850; // Milliseconds to display full tree before beginning to expand moves
const EXPAND_MOVES_DELAY = 700; // Milliseconds between expanding successive moves of solution
const ERROR_MSG_DELAY = 3000; // Milliseconds to display error message if solution was unsuccessful


// Class for managing DOM events & manipulation for each game board
class BishopsBoard {
    $board = null;
    $stats = null;
    $menu = null;
    $loadingIndicator = null;

    selectedSquare = null;
    dragging = false;

    myConnections = [];

    /**
     * @param {Object} [src] - Optional config for constructing from a prior board
     * @param {BishopsBoard} [src.board] - The parent BishopsBoard instance
     * @param {Array} [src.move] - The next move to apply, relative to the parent board, in the format: [[start row, start col], [end row, end col]]
     */
    constructor(src) {
        if (src) {
            const {board, move} = src;
            const {game} = board;

            this.initBoard(game.rows, game.cols);
            this.$board.attr('data-src', board.id); // used for inserting boards in a reasonable order (see insertBoard)

            this.game = new BishopsGame({game, move});
        } else {
            this.initBoard();
            this.game = new BishopsGame();
        }

        this.game.analyzeGame();
        this.renderGame();

        globalState.boards[this.game.hash] = this;

        this.hookEvents();
    }

    initBoard() {
        this.$board = $(`<div class="board" id="b${Object.keys(globalState.boards).length}"></div>`);
        this.$loadingIndicator = $('<canvas class="loading-indicator"></canvas>');
        this.$board.append(this.$loadingIndicator);

        this.$stats = $('<div class="board-stats bg-blur"></div>');
        this.$menu = $('.context-menu:last').clone();
        this.$menuBtn = $('<div class="menu-btn btn"><i class="fa fa-plus-circle"><i></div>');

        this.$boardWrapper = $('<div class="board-wrapper"></div>').append(this.$board, this.$stats, this.$menu, this.$menuBtn);

        const {numRows: rows, numCols: cols} = gameSettings;
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
        const handleContextMenu = (e, dynamicPosition = true) => {
            e.preventDefault();
            e.stopPropagation();

            this.dragging = false;
            this.clearMenus();

            let topOffset = '', leftOffset = '';
            if (dynamicPosition) {
                const $target = $(e.target);
                const {offsetX, offsetY} = e
                const {top, left} = $target.position();

                topOffset = offsetY + top;
                leftOffset = offsetX + left;
            }
            this.$menu.css({
                display: 'block',
                top: topOffset,
                left: leftOffset,
            });

            this.$boardWrapper.toggleClass('clicked-menu', !dynamicPosition);
        };

        this.$boardWrapper.on('click', '.menu-btn', (e) => {
            handleContextMenu(e, false);
        });

        const $svgLayer = $('#svg-layer');
        this.$board
            .on('mouseover', '.square', ({currentTarget}) => {
                const $square = $(currentTarget);
                if ($square.is('.prior-connected-move, .prior-explored-move')) {
                    const priorHash = $square.attr('data-prior');
                    const priorBoard = globalState.boards[priorHash];
                    const key = this.getConnectionKey(this, priorBoard);
                    priorBoard.$board.add($svgLayer.find(`.${key}`)).addClass('prior');
                }
                if (this.selectedSquare) {
                    return;
                }
                this.highlightMoves($square);
            })
            .on('mouseout', '.square', () => {
                if (this.selectedSquare) {
                    $('.prior').removeClass('prior');
                    return;
                }
                this.clearSelection();
            })
            .on('contextmenu', handleContextMenu)
            .on('click', '.square.white, .square.black', (e) => { // i.e. an occupied square
                e.stopPropagation();
                this.clearMenus();

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
            .on('click', '.prior-connected-move', (e) => {
                e.stopPropagation(); // Leave prior connection & label highlighted, for improved mobile usability
            })
            .on('mousedown touchstart', (e) => {
                this.myConnections = this.getMyConnections();
                this.dragging = {x: e.pageX, y: e.pageY};
            })
            .on('mousemove touchmove', (e) => {
                e.preventDefault();
                if (this.dragging) {
                    this.$boardWrapper.css({
                        left: `+=${e.pageX - this.dragging.x}`,
                        top: `+=${e.pageY - this.dragging.y}`
                    });
                    this.dragging = {x: e.pageX, y: e.pageY};
                    $('body').trigger('update-connections', {connections: this.myConnections});
                }
            })
            .on('mouseup touchend', (e) => {
                this.$board.trigger('blur');
                this.dragging = false;
                $('body').trigger('update-layout');
            });

        this.$menu.on('click', '.menu-option', ({target}) => {
            const handleError = ({noSolution, timeExpired, totalMovesExplored}) => {
                if (!(timeExpired || noSolution)) return false;
                let errorMsg;
                if (totalMovesExplored === 0) errorMsg = 'No possible moves.';
                else errorMsg = `Climbed through ${noSolution ? 'all ' : ''}${totalMovesExplored.toLocaleString('en-US')}
                    ${timeExpired ? 'of the ' : ''}possible boards. ${noSolution ? 'No solution exists.' : 'Tree is too big to continue climbing.'}`;
                this.$board
                    .attr('data-error-msg', errorMsg)
                    .addClass('loading-error');
                setTimeout(() => {
                    this.$board.removeClass('is-loading loading-error');
                }, totalMovesExplored ? ERROR_MSG_DELAY : ERROR_MSG_DELAY / 3);
                return true;
            };

            switch($(target).data('action')) {
                case 'expand':
                    this.expandMoves(this.game.getAllValidMoves());
                    break;
                case 'hint':
                    this.$board.addClass('is-loading');
                    this.game.solveGame(this.$loadingIndicator, (results) => {
                        if (handleError(results)) return;
                        setTimeout(() => {
                            this.$board.removeClass('is-loading');
                            this.expandMoves([results.winningMoves[0]]);
                        }, SOLUTION_TREE_DELAY);
                    });
                    break;
                case 'solve':
                    this.$board.addClass('is-loading');
                    this.game.solveGame(this.$loadingIndicator, (results) => {
                        setTimeout(() => {
                            if (handleError(results)) return;

                            this.$board.removeClass('is-loading');

                            const {winningMoves} = results;
                            let index = 0, board = this;

                            const delayedExpand = () => {
                                board = board.expandMoves([winningMoves[index]])[0];
                                $('body').trigger('scroll-to', {$board: board.$board});

                                index++;
                                if (index < winningMoves.length) setTimeout(() => delayedExpand(), EXPAND_MOVES_DELAY);
                            };
                            delayedExpand(this);
                        }, SOLUTION_TREE_DELAY);
                    });
                    break;
                default:
                    break;
            }
            this.clearMenus();
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

    clearMenus() {
        $('body').find('.clicked-menu').removeClass('clicked-menu');
        $('.context-menu').hide();
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

        $('body').trigger('update-layout');
    }

    expandMoves(moves) {
        const expandedBoards = [], newConnections = [];
        moves.forEach((move) => {
            const {hash} = new BishopsGame({game: this.game, move});
            let priorBoard = globalState.boards[hash];
            if (priorBoard) { // If creating a connection to a pre-existing board
                if (this.game.connectGame(priorBoard.game)) { // And the connection doesn't already exist
                    // Create two-way link between games
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
                    globalState.connections[key] = {
                        startBoard,
                        startLabel,
                        endBoard,
                        endLabel
                    };
                    newConnections[key] = globalState.connections[key]
                }

                priorBoard.$board.toggleClass('extra-pop');
                expandedBoards.push(priorBoard);
            } else { // If creating a new board...
                const newBoard = new BishopsBoard({board: this, move});

                newBoard.insertBoard(this.getRow());
                expandedBoards.push(newBoard);

                this.game.connectGame(newBoard.game);

                const key = this.getConnectionKey(this, newBoard);
                globalState.connections[key] = {
                    startBoard: this,
                    startLabel: this.formatCoords(...move[0]),
                    endBoard: newBoard,
                    endLabel: this.formatCoords(...move[1])
                };
                newConnections[key] = globalState.connections[key]
            }
        });

        const {game: firstGame} = globalState.firstBoard;
        firstGame.updateSequence();

        Object.values(globalState.boards).forEach((board) => {
            board.game.updatePriors();
            board.renderStats();
        });

        addConnections(newConnections);
        $('body').trigger('update-connections');
        updateMoveLabels();

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
            BoardStatsTemplate({
                index: this.game.index,
                connectionsClass, connectionsRatio,
                solvedClass, solvedRatio,
            })
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
        return Object.keys(globalState.connections)
            .filter((key) => key.includes(this.id))
            .map((key) => globalState.connections[key]);
    }

    get id() {
        return this.$board.attr('id');
    }
}


/* Helper methods */

function addBranch(key) {
    const $branchGroup = $('#svg-templates .branch-group').clone().appendTo('#all-branches');
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
        .appendTo('#all-leaves');

    const $label = $branchGroup
        .find('.label-group').detach().appendTo('#all-labels').find('.label-text');

    $('body').trigger('update-leaves');
    return {$branch, $label};
}

function addConnections(newConnections) {
    Object.entries(newConnections).forEach(([key, connection]) => {
        Object.assign(connection, addBranch(key));
    });
}

function updateMoveLabels() {
    Object.values(globalState.connections).forEach(({startBoard, startLabel, endBoard, endLabel, $label}) => {
        const indexDelta = endBoard.game.index - startBoard.game.index;
        const direction = (indexDelta > 0) ? '&#8594;' : (indexDelta === 0) ? '-' : '&#8592;';
        $label.html(`${startLabel} ${direction} ${endLabel}`);
    });
}


export default BishopsBoard;