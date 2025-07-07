export interface Ai {
  run: (model: string, options: any) => Promise<any>
}
