import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { JobManagement } from '@/components/JobManagement';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const JobsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdminOrOperator = user?.role === 'admin' || user?.role === 'operator' || (user as any)?.isOrgAdmin;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Print Jobs</h1>
            <p className="text-muted-foreground">
              {isAdminOrOperator 
                ? 'Manage print jobs and send completion notifications'
                : 'View your print jobs'}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <JobManagement />
      </div>
    </div>
  );
};

export default JobsPage;
