import {gameSettings, globalState} from './shared';


/* Constants */

const TREE_MARGIN = 10; // Spacing around solution tree in canvas preview


// Class for managing all game logic (rules, analysis) for each game state
class BishopsGame {
    state = [];

    connectedGames = {};
    lastMove = null;
    history = [];

    solvedPieces = 0;
    totalPieces = 0;

    connectedOptions = 0;
    exploredOptions = 0;
    totalOptions = 0;

    /**
     * @param {Object} [src] - Optional config for constructing from a prior game
     * @param {BishopsGame} [src.game] - The parent BishopsGame instance
     * @param {Array} [src.move] - The next move to apply, relative to the parent game, in the format: [[start row, start col], [end row, end col]]
     */
    constructor(src) {
        if (src) {
            const {game, move} = src;
            this.state = JSON.parse(JSON.stringify(game.state));
            this.applyMove(move);
            this.connectedGames[game.hash] = game;
        } else {
            this.initializeGame();
        }
    }

    initializeGame() {
        const {numRows: rows, numCols: cols, showPieces: pieces} = gameSettings;

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

    /**
     * @param {jQuery} $canvas - Canvas element where solution tree will be rendered
     * @param {function} callback - Takes an object with the following possible properties: winningMoves, totalMovesExplored, noSolution, timeExpired
     * @param {number} [timeout] - Optional max time duration (in seconds) before search will terminate
     */
    solveGame($canvas, callback, timeout = 15) {
        const moveHistory = this.history.concat(this.hash) // Don't "backtrack" to games in this game's own history
            .reduce((acc, hash) => Object.assign(acc, {[hash]: '[]'}), {});
        let winningMoves, totalMovesExplored = 0;

        const tree = [
            [{children: []}]
        ];
        let leaves = [this];

        let startTime = Date.now();

        const solveNextLayer = () => {
            if (!leaves.length) return callback({noSolution: true, totalMovesExplored});

            const newLeaves = [];
            let treeIndex = 0;
            for (let i = 0; i < leaves.length; i++) {
                const possibleGames = leaves[i].getPossibleGames();
                for (let j = 0; j < possibleGames.length; j++) {
                    if ((Date.now() - startTime) / 1000 > timeout) return callback ({timeExpired: true, totalMovesExplored});

                    const possibleGame = possibleGames[j];
                    if (moveHistory[possibleGame.hash]) continue; // If already exists in solution history, this isn't the shortest path

                    possibleGame.analyzeGame();

                    newLeaves.push(possibleGame);
                    totalMovesExplored++;

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
                return callback({winningMoves: JSON.parse(`[${winningMoves}]`).slice(1), totalMovesExplored});
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
        return this.getAllValidMoves(true).map((move) => new BishopsGame({game: this, move}));
    }

    // Returns true if successful, but false if already connected
    connectGame(game) {
        if (this.connectedGames[game.hash]) return false;
        this.connectedGames[game.hash] = game;
        return true;
    }

    updateSequence() {
        // Special behavior for first game: reset all other indices before calculating
        if (this.index === 0) {
            Object.values(globalState.boards)
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
                        const possibleGame = new BishopsGame({game: this, move: [[r, c], [move.row, move.col]]});
                        move.result = possibleGame.hash;
                    }
                    if (move.type !== 'invalid') {
                        this.totalOptions++;
                        if (globalState.boards[move.result]) {
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


/* Canvas methods - for visualizing tree of possible game states */

function sketchTree($sketch, treeData) {
    const {firstBoard} = globalState;
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


/* Helper methods */

function oppositeColor(color) {
    return (color === 'white') ? 'black' : 'white';
}


export default BishopsGame;