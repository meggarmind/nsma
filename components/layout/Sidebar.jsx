'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {  FolderSync, LayoutDashboard, Settings, FileText, FolderOpen, Plus } from 'lucide-react';
import Badge from '../ui/Badge';

export default function Sidebar({ projects = [] }) {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/logs', label: 'Logs', icon: FileText },
  ];

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="w-72 h-screen bg-dark-900 border-r border-dark-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/20 rounded-lg">
            <FolderSync className="text-accent" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-dark-50">NSMA</h1>
            <p className="text-xs text-dark-500">Notion Sync Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              isActive(item.href)
                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                : 'text-dark-400 hover:bg-dark-800 hover:text-dark-200'
            }`}
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}

        {/* Projects Section */}
        <div className="pt-6">
          <div className="flex items-center justify-between px-4 mb-2">
            <span className="text-xs font-semibold text-dark-500 uppercase tracking-wider">
              Projects
            </span>
            <Link
              href="/?modal=new-project"
              className="p-1 rounded hover:bg-dark-800 text-dark-500 hover:text-dark-300 transition-colors"
            >
              <Plus size={16} />
            </Link>
          </div>

          {projects.length === 0 ? (
            <p className="px-4 py-2 text-sm text-dark-600 italic">No projects yet</p>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                    pathname === `/projects/${project.id}`
                      ? 'bg-dark-800 text-dark-100'
                      : 'text-dark-500 hover:bg-dark-800 hover:text-dark-300'
                  }`}
                >
                  <FolderOpen size={16} />
                  <span className="flex-1 text-sm truncate">{project.name}</span>
                  {!project.active && (
                    <Badge variant="warning" className="text-xs">Paused</Badge>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-800">
        <p className="text-xs text-dark-600 text-center">
          v1.0.0 • Built with Next.js
        </p>
      </div>
    </div>
  );
}
