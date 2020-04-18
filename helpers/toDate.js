module.exports = function toDate(string) {
    return new Date(string.replace( /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/, "$2/$1/$3 $4:$5"))
}
