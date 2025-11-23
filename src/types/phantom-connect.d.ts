declare module 'phantom-connect' {
  export class PhantomConnect {
    constructor(options: {
      network?: 'evm' | 'solana';
      dappId?: string;
      appUrl?: string;
    });
    connect(): Promise<{ publicKey?: string; address?: string }>;
    disconnect(): Promise<void>;
  }
}


