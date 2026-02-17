/**
 * Homepage route: render the marketing landing page with (main) layout (header, footer, hero background).
 */
import MainLayout from "./(main)/layout";
import HomePage from "./(main)/page";

export default function RootPage() {
  return (
    <MainLayout>
      <HomePage />
    </MainLayout>
  );
}
