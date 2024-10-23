import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';

// Hardcode "pixelapes" pool ID
const PIXELAPES_POOL_ID = 'E6Svu8eQyb7k8Z3KEn4RELDXDJSYws13pdbnX82xBke';  // Replace with the actual public key

export const useStakePoolId = () => {
  return useQuery(
    ['useStakePoolId', PIXELAPES_POOL_ID],
    async () => new PublicKey(PIXELAPES_POOL_ID)
  );
};
