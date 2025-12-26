import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { ToastProvider } from '@/hooks/useToast';
import { getProjects } from '@/lib/storage';

export const metadata = {
  title: 'Notion Sync Manager',
  description: 'Multi-project development inbox processor with Notion integration',
};

export default async function RootLayout({ children }) {
  const projects = await getProjects();

  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar projects={projects} />
            <main className="flex-1 p-8 overflow-y-auto">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
