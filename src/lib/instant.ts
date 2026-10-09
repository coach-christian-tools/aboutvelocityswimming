export class Instant {
  constructor(private readonly milliseconds: number) {}
  static now() {
    return new Instant(Date.now());
  }
  static fromDate(date: Date) {
    return new Instant(date.getTime());
  }
  static fromMillis(ms: number) {
    return new Instant(ms);
  }
  toDate() {
    return new Date(this.milliseconds);
  }
  toMillis() {
    return this.milliseconds;
  }
  toJSON() {
    return this.toDate().toISOString();
  }
  get seconds() {
    return Math.floor(this.milliseconds / 1000);
  }
  get nanoseconds() {
    return (this.milliseconds % 1000) * 1000000;
  }
}
export { Instant as Timestamp };
