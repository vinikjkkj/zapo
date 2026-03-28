export function repeatSqlToken(token: string, count: number, separator: string): string {
    if (count <= 1) {
        return token
    }
    let out = token
    for (let index = 1; index < count; index += 1) {
        out += separator + token
    }
    return out
}
