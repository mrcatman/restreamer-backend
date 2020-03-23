module.exports = function(array, strict = false)  {
    if(array.length == 0)
        return null;
    let modeMap = {};
    let maxEl = array[0], maxCount = 1;
    for(let i = 0; i < array.length; i++)
    {
        let el = array[i];
        if(modeMap[el] == null)
            modeMap[el] = 1;
        else
            modeMap[el]++;
        if(modeMap[el] > maxCount)
        {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    if (!strict) {
        return maxEl;
    }
    let secondResult = 0;
    Object.keys(modeMap).forEach(key => {
        if (modeMap[key] > secondResult) {
            secondResult = modeMap[key]
        }
    })
    if (secondResult !== maxEl) {
        return maxEl;
    }
    return null;
}
