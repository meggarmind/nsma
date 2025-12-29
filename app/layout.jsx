import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import ClientProviders from '@/components/providers/ClientProviders';
import { getProjects } from '@/lib/storage';

export const metadata = {
  title: 'Notion Sync Manager',
  description: 'Multi-project development inbox processor with Notion integration',
};

export default async function RootLayout({ children }) {
  // Server-side initial project load for Sidebar static content
  const projects = await getProjects();

  return (
    <html lang="en">
      <body>
        <ClientProviders>
          <div className="flex min-h-screen">
            <Sidebar projects={projects} />
            <main className="flex-1 p-8 overflow-y-auto">
              {children}
            </main>
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
