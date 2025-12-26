'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import Header from '@/components/layout/Header';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=50');
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="text-dark-500">Loading...</div>;
  }

  return (
    <>
      <Header
        title="Sync Logs"
        description="View recent synchronization history and activity"
      />

      {logs.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No sync logs yet"
          description="Logs will appear here after your first sync operation"
        />
      ) : (
        <div className="space-y-4">
          {logs.map((log, index) => (
            <Card key={index}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {log.errors > 0 ? (
                    <XCircle className="text-red-400 mt-1" size={20} />
                  ) : (
                    <CheckCircle className="text-green-400 mt-1" size={20} />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-dark-50 mb-1">
                      {log.projectName}
                    </h3>
                    <p className="text-sm text-dark-500 mb-2">
                      {formatDate(log.timestamp)}
                    </p>
                    <div className="flex gap-3">
                      <Badge variant="success">
                        {log.processed} processed
                      </Badge>
                      {log.errors > 0 && (
                        <Badge variant="danger">
                          {log.errors} errors
                        </Badge>
                      )}
                    </div>
                    {log.items && log.items.length > 0 && (
                      <div className="mt-3 text-sm text-dark-400">
                        <p className="font-medium mb-1">Items:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {log.items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
