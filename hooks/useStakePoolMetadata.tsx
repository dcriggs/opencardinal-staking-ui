import { tryPublicKey } from '@cardinal/common';
import { getConfigEntry, getConfigEntryById } from '@manaform/configs/dist/cjs/programs/accounts';
import type { Connection } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import type { StakePoolMetadata } from 'helpers/mapping';
import { useEnvironmentCtx } from 'providers/EnvironmentProvider';

// Hardcode the PublicKey for the "pixelapes" pool
const PIXELAPES_STAKE_POOL_ID = 'EQuYvFtX7FsWTkRDB1bCowMMTDTeQQ1XSLSD2qXbYZNo'; // Replace with actual public key

export const useStakePoolMetadata = () => {
  const { connection } = useEnvironmentCtx();

  return useQuery(
    ['useStakePoolMetadata', PIXELAPES_STAKE_POOL_ID], // Using fixed ID for "pixelapes"
    async () => {
      return stakePoolConfig(connection, PIXELAPES_STAKE_POOL_ID);
    },
    {
      // Optional: Adjust settings to refetch the metadata periodically
      refetchOnWindowFocus: true, // Refetch data when window regains focus
      staleTime: 1000 * 60 * 5,   // Data will be considered fresh for 5 minutes
    }
  );
};

// Function to fetch metadata from the Solana blockchain
export const stakePoolConfig = async (
  connection: Connection,
  key: string
): Promise<StakePoolMetadata | null> => {
  const stakePoolIdPubkey = tryPublicKey(key);
  if (!stakePoolIdPubkey) {
    // Handle invalid public key
    return null;
  }

  // Fetch the metadata entry from the config
  const reverseConfigEntryData = await getConfigEntry(connection, Buffer.from('s', 'utf-8'), stakePoolIdPubkey.toBuffer());

  if (reverseConfigEntryData?.parsed) {
    const configEntryId = reverseConfigEntryData.parsed.extends[0];

    // Ensure configEntryId is defined and of type PublicKey
    if (configEntryId) {
      const configEntryData = await getConfigEntryById(connection, configEntryId);
      if (configEntryData?.parsed) {
        return JSON.parse(configEntryData.parsed.value); // Return the fetched metadata
      }
    } else {
      // Handle the case where configEntryId is undefined
      console.error("configEntryId is undefined");
      // Optionally return or throw an error here
    }
  }  

  return null;
};
