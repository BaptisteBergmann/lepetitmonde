import { getBabiesList } from '@/utils/actions/baby';
import Header from './header';


export default async function HeaderWrapper() {
  const babies = await getBabiesList()
  return (
    <Header babies={babies} />
  );
}


