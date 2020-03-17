const filterFn = (data, fieldsToHide) => {
    let dataCopy = JSON.parse(JSON.stringify(data));
    fieldsToHide.forEach(field => {
        dataCopy[field] = undefined;
    })
    return dataCopy;
}

const filterFields = (data, fieldsToHide) => {
    if (Array.isArray(data)) {
        return data.map(item => filterFn(item, fieldsToHide))
    }
    return filterFn(data, fieldsToHide)
}

module.exports = filterFields;
