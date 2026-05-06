declare module "pg" {
  export type QueryResult<T = any> = {
    rows: T[];
    rowCount: number | null;
  };

  export class Pool {
    constructor(config?: unknown);
    query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
    on(event: "error", listener: (error: Error) => void): this;
    end(): Promise<void>;
  }
}
