// Settings that can be customized from the left sidebar
const gameSettings = {
    numRows: 4,
    numCols: 5,
    showPieces: 'all',
    showMoves: false,
    drawBranches: true,
};

// Collections of game objects
const globalState = {
    boards: null,
    firstBoard: null,
    connections: null,
}

export {gameSettings, globalState};