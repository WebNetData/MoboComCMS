/** Keep the best `limit` candidates, with the worst retained candidate at the heap root. */
export class RankedWindow<T> {
  private readonly heap: T[] = []

  constructor(private readonly limit: number, private readonly compare: (a: T, b: T) => number) {}

  get size() { return this.heap.length }

  add(value: T) {
    if (this.limit <= 0) return
    if (this.heap.length < this.limit) {
      this.heap.push(value)
      let at = this.heap.length - 1
      while (at > 0) {
        const parent = Math.floor((at - 1) / 2)
        if (this.compare(this.heap[at], this.heap[parent]) <= 0) break
        ;[this.heap[at], this.heap[parent]] = [this.heap[parent], this.heap[at]]
        at = parent
      }
      return
    }
    if (this.compare(value, this.heap[0]) >= 0) return
    this.heap[0] = value
    let at = 0
    for (;;) {
      const left = at * 2 + 1
      if (left >= this.heap.length) break
      const right = left + 1
      const worst = right < this.heap.length && this.compare(this.heap[right], this.heap[left]) > 0 ? right : left
      if (this.compare(this.heap[worst], this.heap[at]) <= 0) break
      ;[this.heap[at], this.heap[worst]] = [this.heap[worst], this.heap[at]]
      at = worst
    }
  }

  sorted(): T[] { return [...this.heap].sort(this.compare) }
}
