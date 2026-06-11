import { PrintFarmDashboard } from "@/components/PrintFarmDashboard";
import { useAuth } from "@/contexts/AuthContext";
import StudentPortal from "./StudentPortal";

const Index = () => {
  const { user } = useAuth();

  // Students get the submission portal; operators/admins get the farm dashboard.
  if (user?.role === 'student') {
    return <StudentPortal />;
  }

  return (
    <div>
      <PrintFarmDashboard />
    </div>
  );
};

export default Index;
