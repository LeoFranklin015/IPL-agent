declare module "@neardefi/shade-agent-js" {
  export const networkId: string;

  export function contractCall(params: {
    accountId: string;
    contractId: string;
    methodName: string;
    args: Record<string, any>;
  }): Promise<{
    big_r: { affine_point: string };
    s: { scalar: string };
    recovery_id: number;
  }>;

  export function generateAddress(params: {
    publicKey: string;
    accountId: string;
    path: string;
    chain: string;
  }): Promise<{ address: string }>;
}
