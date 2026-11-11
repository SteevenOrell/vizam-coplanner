import { Redirect } from 'expo-router';

/** Placeholder route for the centre "+" tab button, which navigates to /transaction/new instead. */
export default function AddTab() {
  return <Redirect href="/transaction/new" />;
}
