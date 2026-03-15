export {};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      rawBody?: string;
      auth?: {
        uid: string;
        walletAddress: string;
        token: string;
      };
    }
  }
}
