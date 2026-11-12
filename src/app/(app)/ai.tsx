import { useRouter } from 'expo-router';

import { AskScreen } from '@/components/ai';

/** Android: the floating AI button opens this full page (the mark animates out of the button). */
export default function AskPage() {
  const router = useRouter();
  return <AskScreen onClose={() => router.back()} />;
}
