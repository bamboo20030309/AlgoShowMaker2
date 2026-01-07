(function() {
    let track = 0;
    function renderFrame(f) {
        clearAllEditorHighlights();
        clearCanvas();
        switch(f) {
            case 0:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0],  [{ type: "highlight", elements: [0]},{ type: "focus", elements: [0]},{ type: "point", elements: [0]},{ type: "mark", elements: [0]},{ type: "background", elements: [0]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0],  [{ type: "highlight", elements: [-1]},{ type: "focus", elements: [-1]},{ type: "point", elements: [-1]},{ type: "mark", elements: [-1]},{ type: "background", elements: [-1]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0],  [{ type: "highlight", elements: [-1]},{ type: "focus", elements: [-1]},{ type: "point", elements: [-1]},{ type: "mark", elements: [-1]},{ type: "background", elements: [-1]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 1 }, { group: "BIT", index: 0 }, {  });
                }
                break;
            case 1:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1],  [{ type: "highlight", elements: [1]},{ type: "focus", elements: [1]},{ type: "point", elements: [1]},{ type: "mark", elements: [1]},{ type: "background", elements: [1]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1],  [{ type: "highlight", elements: [1]},{ type: "focus", elements: [1]},{ type: "point", elements: [1]},{ type: "mark", elements: [1]},{ type: "background", elements: [1]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1],  [{ type: "highlight", elements: [0]},{ type: "focus", elements: [0]},{ type: "point", elements: [0]},{ type: "mark", elements: [0]},{ type: "background", elements: [0]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1],  [{ type: "highlight", elements: [0]},{ type: "focus", elements: [0]},{ type: "point", elements: [0]},{ type: "mark", elements: [0]},{ type: "background", elements: [0]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 2 }, { group: "BIT", index: 1 }, {  });
                }
                break;
            case 2:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2],  [{ type: "highlight", elements: [2]},{ type: "focus", elements: [2]},{ type: "point", elements: [2]},{ type: "mark", elements: [2]},{ type: "background", elements: [2]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2],  [{ type: "highlight", elements: [2]},{ type: "focus", elements: [2]},{ type: "point", elements: [2]},{ type: "mark", elements: [2]},{ type: "background", elements: [2]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2],  [{ type: "highlight", elements: [1]},{ type: "focus", elements: [1]},{ type: "point", elements: [1]},{ type: "mark", elements: [1]},{ type: "background", elements: [1]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2],  [{ type: "highlight", elements: [1]},{ type: "focus", elements: [1]},{ type: "point", elements: [1]},{ type: "mark", elements: [1]},{ type: "background", elements: [1]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 3 }, { group: "BIT", index: 2 }, {  });
                }
                break;
            case 3:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3],  [{ type: "highlight", elements: [3]},{ type: "focus", elements: [3]},{ type: "point", elements: [3]},{ type: "mark", elements: [3]},{ type: "background", elements: [3]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3],  [{ type: "highlight", elements: [2]},{ type: "focus", elements: [2]},{ type: "point", elements: [2]},{ type: "mark", elements: [2]},{ type: "background", elements: [2]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3],  [{ type: "highlight", elements: [2]},{ type: "focus", elements: [2]},{ type: "point", elements: [2]},{ type: "mark", elements: [2]},{ type: "background", elements: [2]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 4 }, { group: "BIT", index: 3 }, {  });
                }
                if (track === 1) {
                    addEditorHighlight(17);
                    drawArray('num', 0, 0, [0,0,1,2,3],  [{ type: "mark", elements: [0,1,2,3]},{ type: "highlight", elements: [3]},{ type: "point", elements: [3]},{ type: "focus", elements: [3]},{ type: "background", elements: [3]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(18);
                    drawArray('heap', 0, 150, [0,0,1,2,3],  [{ type: "mark", elements: [0,1,2,3]},{ type: "highlight", elements: [2]},{ type: "point", elements: [2]},{ type: "focus", elements: [2]},{ type: "background", elements: [2]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(19);
                    drawArray('BIT', 0, 300, [0,0,1,2,3],  [{ type: "mark", elements: [0,1,2,3]},{ type: "highlight", elements: [2]},{ type: "point", elements: [2]},{ type: "focus", elements: [2]},{ type: "background", elements: [2]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                break;
            case 4:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4],  [{ type: "highlight", elements: [4]},{ type: "focus", elements: [4]},{ type: "point", elements: [4]},{ type: "mark", elements: [4]},{ type: "background", elements: [4]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4],  [{ type: "highlight", elements: [3]},{ type: "focus", elements: [3]},{ type: "point", elements: [3]},{ type: "mark", elements: [3]},{ type: "background", elements: [3]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4],  [{ type: "highlight", elements: [3]},{ type: "focus", elements: [3]},{ type: "point", elements: [3]},{ type: "mark", elements: [3]},{ type: "background", elements: [3]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 5 }, { group: "BIT", index: 4 }, {  });
                }
                break;
            case 5:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5],  [{ type: "highlight", elements: [5]},{ type: "focus", elements: [5]},{ type: "point", elements: [5]},{ type: "mark", elements: [5]},{ type: "background", elements: [5]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5],  [{ type: "highlight", elements: [4]},{ type: "focus", elements: [4]},{ type: "point", elements: [4]},{ type: "mark", elements: [4]},{ type: "background", elements: [4]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5],  [{ type: "highlight", elements: [4]},{ type: "focus", elements: [4]},{ type: "point", elements: [4]},{ type: "mark", elements: [4]},{ type: "background", elements: [4]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 6 }, { group: "BIT", index: 5 }, {  });
                }
                break;
            case 6:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6],  [{ type: "highlight", elements: [6]},{ type: "focus", elements: [6]},{ type: "point", elements: [6]},{ type: "mark", elements: [6]},{ type: "background", elements: [6]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6],  [{ type: "highlight", elements: [5]},{ type: "focus", elements: [5]},{ type: "point", elements: [5]},{ type: "mark", elements: [5]},{ type: "background", elements: [5]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6],  [{ type: "highlight", elements: [5]},{ type: "focus", elements: [5]},{ type: "point", elements: [5]},{ type: "mark", elements: [5]},{ type: "background", elements: [5]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 7 }, { group: "BIT", index: 6 }, {  });
                }
                break;
            case 7:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7],  [{ type: "highlight", elements: [7]},{ type: "focus", elements: [7]},{ type: "point", elements: [7]},{ type: "mark", elements: [7]},{ type: "background", elements: [7]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7],  [{ type: "highlight", elements: [6]},{ type: "focus", elements: [6]},{ type: "point", elements: [6]},{ type: "mark", elements: [6]},{ type: "background", elements: [6]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7],  [{ type: "highlight", elements: [6]},{ type: "focus", elements: [6]},{ type: "point", elements: [6]},{ type: "mark", elements: [6]},{ type: "background", elements: [6]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 8 }, { group: "BIT", index: 7 }, {  });
                }
                if (track === 1) {
                    addEditorHighlight(17);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7]},{ type: "highlight", elements: [7]},{ type: "point", elements: [7]},{ type: "focus", elements: [7]},{ type: "background", elements: [7]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(18);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7]},{ type: "highlight", elements: [6]},{ type: "point", elements: [6]},{ type: "focus", elements: [6]},{ type: "background", elements: [6]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(19);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7]},{ type: "highlight", elements: [6]},{ type: "point", elements: [6]},{ type: "focus", elements: [6]},{ type: "background", elements: [6]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                break;
            case 8:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8],  [{ type: "highlight", elements: [8]},{ type: "focus", elements: [8]},{ type: "point", elements: [8]},{ type: "mark", elements: [8]},{ type: "background", elements: [8]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8],  [{ type: "highlight", elements: [7]},{ type: "focus", elements: [7]},{ type: "point", elements: [7]},{ type: "mark", elements: [7]},{ type: "background", elements: [7]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8],  [{ type: "highlight", elements: [7]},{ type: "focus", elements: [7]},{ type: "point", elements: [7]},{ type: "mark", elements: [7]},{ type: "background", elements: [7]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 9 }, { group: "BIT", index: 8 }, {  });
                }
                break;
            case 9:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9],  [{ type: "highlight", elements: [9]},{ type: "focus", elements: [9]},{ type: "point", elements: [9]},{ type: "mark", elements: [9]},{ type: "background", elements: [9]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9],  [{ type: "highlight", elements: [8]},{ type: "focus", elements: [8]},{ type: "point", elements: [8]},{ type: "mark", elements: [8]},{ type: "background", elements: [8]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9],  [{ type: "highlight", elements: [8]},{ type: "focus", elements: [8]},{ type: "point", elements: [8]},{ type: "mark", elements: [8]},{ type: "background", elements: [8]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 10 }, { group: "BIT", index: 9 }, {  });
                }
                break;
            case 10:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10],  [{ type: "highlight", elements: [10]},{ type: "focus", elements: [10]},{ type: "point", elements: [10]},{ type: "mark", elements: [10]},{ type: "background", elements: [10]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10],  [{ type: "highlight", elements: [9]},{ type: "focus", elements: [9]},{ type: "point", elements: [9]},{ type: "mark", elements: [9]},{ type: "background", elements: [9]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10],  [{ type: "highlight", elements: [9]},{ type: "focus", elements: [9]},{ type: "point", elements: [9]},{ type: "mark", elements: [9]},{ type: "background", elements: [9]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 11 }, { group: "BIT", index: 10 }, {  });
                }
                break;
            case 11:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11],  [{ type: "highlight", elements: [11]},{ type: "focus", elements: [11]},{ type: "point", elements: [11]},{ type: "mark", elements: [11]},{ type: "background", elements: [11]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11],  [{ type: "highlight", elements: [10]},{ type: "focus", elements: [10]},{ type: "point", elements: [10]},{ type: "mark", elements: [10]},{ type: "background", elements: [10]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11],  [{ type: "highlight", elements: [10]},{ type: "focus", elements: [10]},{ type: "point", elements: [10]},{ type: "mark", elements: [10]},{ type: "background", elements: [10]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 12 }, { group: "BIT", index: 11 }, {  });
                }
                break;
            case 12:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12],  [{ type: "highlight", elements: [12]},{ type: "focus", elements: [12]},{ type: "point", elements: [12]},{ type: "mark", elements: [12]},{ type: "background", elements: [12]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12],  [{ type: "highlight", elements: [11]},{ type: "focus", elements: [11]},{ type: "point", elements: [11]},{ type: "mark", elements: [11]},{ type: "background", elements: [11]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12],  [{ type: "highlight", elements: [11]},{ type: "focus", elements: [11]},{ type: "point", elements: [11]},{ type: "mark", elements: [11]},{ type: "background", elements: [11]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 13 }, { group: "BIT", index: 12 }, {  });
                }
                break;
            case 13:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "highlight", elements: [13]},{ type: "focus", elements: [13]},{ type: "point", elements: [13]},{ type: "mark", elements: [13]},{ type: "background", elements: [13]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "highlight", elements: [12]},{ type: "focus", elements: [12]},{ type: "point", elements: [12]},{ type: "mark", elements: [12]},{ type: "background", elements: [12]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "highlight", elements: [12]},{ type: "focus", elements: [12]},{ type: "point", elements: [12]},{ type: "mark", elements: [12]},{ type: "background", elements: [12]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 14 }, { group: "BIT", index: 13 }, {  });
                }
                if (track === 1) {
                    addEditorHighlight(17);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7,8,9,10,11,12,13]},{ type: "highlight", elements: [13]},{ type: "point", elements: [13]},{ type: "focus", elements: [13]},{ type: "background", elements: [13]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(18);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7,8,9,10,11,12,13]},{ type: "highlight", elements: [12]},{ type: "point", elements: [12]},{ type: "focus", elements: [12]},{ type: "background", elements: [12]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 1) {
                    addEditorHighlight(19);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13],  [{ type: "mark", elements: [0,1,2,3,4,5,6,7,8,9,10,11,12,13]},{ type: "highlight", elements: [12]},{ type: "point", elements: [12]},{ type: "focus", elements: [12]},{ type: "background", elements: [12]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                break;
            case 14:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],  [{ type: "highlight", elements: [14]},{ type: "focus", elements: [14]},{ type: "point", elements: [14]},{ type: "mark", elements: [14]},{ type: "background", elements: [14]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],  [{ type: "highlight", elements: [13]},{ type: "focus", elements: [13]},{ type: "point", elements: [13]},{ type: "mark", elements: [13]},{ type: "background", elements: [13]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],  [{ type: "highlight", elements: [13]},{ type: "focus", elements: [13]},{ type: "point", elements: [13]},{ type: "mark", elements: [13]},{ type: "background", elements: [13]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 15 }, { group: "BIT", index: 14 }, {  });
                }
                break;
            case 15:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],  [{ type: "highlight", elements: [15]},{ type: "focus", elements: [15]},{ type: "point", elements: [15]},{ type: "mark", elements: [15]},{ type: "background", elements: [15]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],  [{ type: "highlight", elements: [14]},{ type: "focus", elements: [14]},{ type: "point", elements: [14]},{ type: "mark", elements: [14]},{ type: "background", elements: [14]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],  [{ type: "highlight", elements: [14]},{ type: "focus", elements: [14]},{ type: "point", elements: [14]},{ type: "mark", elements: [14]},{ type: "background", elements: [14]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 16 }, { group: "BIT", index: 15 }, {  });
                }
                break;
            case 16:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],  [{ type: "highlight", elements: [16]},{ type: "focus", elements: [16]},{ type: "point", elements: [16]},{ type: "mark", elements: [16]},{ type: "background", elements: [16]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],  [{ type: "highlight", elements: [15]},{ type: "focus", elements: [15]},{ type: "point", elements: [15]},{ type: "mark", elements: [15]},{ type: "background", elements: [15]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],  [{ type: "highlight", elements: [15]},{ type: "focus", elements: [15]},{ type: "point", elements: [15]},{ type: "mark", elements: [15]},{ type: "background", elements: [15]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 17 }, { group: "BIT", index: 16 }, {  });
                }
                break;
            case 17:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],  [{ type: "highlight", elements: [17]},{ type: "focus", elements: [17]},{ type: "point", elements: [17]},{ type: "mark", elements: [17]},{ type: "background", elements: [17]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],  [{ type: "highlight", elements: [16]},{ type: "focus", elements: [16]},{ type: "point", elements: [16]},{ type: "mark", elements: [16]},{ type: "background", elements: [16]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],  [{ type: "highlight", elements: [16]},{ type: "focus", elements: [16]},{ type: "point", elements: [16]},{ type: "mark", elements: [16]},{ type: "background", elements: [16]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 18 }, { group: "BIT", index: 17 }, {  });
                }
                break;
            case 18:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],  [{ type: "highlight", elements: [18]},{ type: "focus", elements: [18]},{ type: "point", elements: [18]},{ type: "mark", elements: [18]},{ type: "background", elements: [18]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],  [{ type: "highlight", elements: [17]},{ type: "focus", elements: [17]},{ type: "point", elements: [17]},{ type: "mark", elements: [17]},{ type: "background", elements: [17]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],  [{ type: "highlight", elements: [17]},{ type: "focus", elements: [17]},{ type: "point", elements: [17]},{ type: "mark", elements: [17]},{ type: "background", elements: [17]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 19 }, { group: "BIT", index: 18 }, {  });
                }
                break;
            case 19:
                if (track === 0) {
                    addEditorHighlight(11);
                    drawArray('num', 0, 0, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],  [{ type: "highlight", elements: [19]},{ type: "focus", elements: [19]},{ type: "point", elements: [19]},{ type: "mark", elements: [19]},{ type: "background", elements: [19]}], [0], "normal", 0, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(12);
                    drawArray('heap', 0, 150, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],  [{ type: "highlight", elements: [18]},{ type: "focus", elements: [18]},{ type: "point", elements: [18]},{ type: "mark", elements: [18]},{ type: "background", elements: [18]}], [0], "heap", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    addEditorHighlight(13);
                    drawArray('BIT', 0, 300, [0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],  [{ type: "highlight", elements: [18]},{ type: "focus", elements: [18]},{ type: "point", elements: [18]},{ type: "mark", elements: [18]},{ type: "background", elements: [18]}], [0], "BIT", 10, 1, [],  [],  [],  [],  []);
                }
                if (track === 0) {
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" });
                    drawArrow({ group: "num", direction: "bottom" }, { group: "heap", direction: "top" }, { color: "black" ,width: "3" });
                }
                if (track === 0) {
                    drawArrow({ group: "num", index: 20 }, { group: "BIT", index: 19 }, {  });
                }
                break;
        }
    }
    let currentFrame = 0;
    const totalFrames = 20;
    const keyFrames = [3,3,3,7,7,7,13,13,13];
    const stopFrames = [19];
    const fastFrames = [];
    const fastonFrames = [];
    const skipFrames = [];

    function findNextKey(frame) {
        let L = 0, R = keyFrames.length - 1;
        let ans = (keyFrames.length > 0?keyFrames[keyFrames.length-1] : totalFrames - 1);
        while (L <= R) {
            const M = Math.floor((L + R) / 2);
            if (keyFrames[M] > frame) {
                ans = keyFrames[M];
                R = M - 1;
            } else {
                L = M + 1;
            }
        }
        return ans;
    }

    function findPrevKey(frame) {
        let L = 0, R = keyFrames.length - 1;
        let ans = (keyFrames.length > 0?keyFrames[0] : 0);
        while (L <= R) {
        const M = Math.floor((L + R) / 2);
            if (keyFrames[M] < frame) {
                ans = keyFrames[M];
                L = M + 1;
            } else {
                R = M - 1;
            }
        }
        return ans;
    }

    window.CodeScript = {
        next() {
            track = 0;
            if (currentFrame < totalFrames - 1) {
                currentFrame++;
                renderFrame(currentFrame);
            }
        },
        prev() {
            track = 0;
            if (currentFrame > 0) {
                currentFrame--;
                renderFrame(currentFrame);
            }
        },
        next_key_frame() {
            if (keyFrames.length > 0){
                track = 1;
                currentFrame = findNextKey(currentFrame);
                renderFrame(currentFrame);
            }
        },
        prev_key_frame() {
            if (keyFrames.length > 0){
                track = 1;
                currentFrame = findPrevKey(currentFrame);
                renderFrame(currentFrame);
            }
        },
        reset() {
            track = 0;
            currentFrame = 0;
            renderFrame(0);
        },
        goto(n) {
            if (n >= 0 && n < totalFrames) {
                track = 0;
                currentFrame = n;
                renderFrame(n);
            } else if (n == -1) {
                track = 0;
                currentFrame = totalFrames - 1;
                renderFrame(totalFrames - 1);
            }
        },
        get_frame_count() {
            return totalFrames;
        },
        get_current_frame_index() {
            return currentFrame;
        },
        get_key_frames() {
            return keyFrames;
        },
        get_stop_frames() {
            return stopFrames;
        },
        is_stop_frame() {
            return stopFrames.includes(currentFrame);
        },
        is_fast_frame() {
            return fastFrames.includes(currentFrame);
        },
        is_faston_frame() {
            return fastonFrames.includes(currentFrame);
        },
        is_skip_frame() {
            return skipFrames.includes(currentFrame);
        }
    };
    document.addEventListener('DOMContentLoaded', () => {
        CodeScript.reset();
    });
})();

