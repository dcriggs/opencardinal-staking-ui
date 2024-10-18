import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';

// Hardcode "pixelapes" pool ID
const PIXELAPES_POOL_ID = '5kUaKCD3EJ9xuXyUCM3ugzg1iGHA9i4AFyCqdSayvMuC';  // Replace with the actual public key

export const useStakePoolId = () => {
  return useQuery(
    ['useStakePoolId', PIXELAPES_POOL_ID],
    async () => new PublicKey(PIXELAPES_POOL_ID)
  );
};
