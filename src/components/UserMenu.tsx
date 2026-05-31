import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, LogOut, Sun, Moon, AlertTriangle, Settings, BarChart3, Clock, Briefcase, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface UserMenuProps {
  isDarkMode: boolean;
  onThemeChange: (isDark: boolean) => void;
  pauseOnFilamentOut: boolean;
  onPauseOnFilamentOutChange: (pause: boolean) => void;
  farmWorkHours: { start: number; end: number };
  onFarmWorkHoursChange: (hours: { start: number; end: number }) => void;
}

export function UserMenu({ 
  isDarkMode, 
  onThemeChange, 
  pauseOnFilamentOut, 
  onPauseOnFilamentOutChange,
  farmWorkHours,
  onFarmWorkHoursChange
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { logout, isOrgAdmin, isAdmin, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    setIsOpen(false);
  };

  const handleAdminClick = () => {
    navigate('/admin');
    setIsOpen(false);
  };

  const handleSuperAdminClick = () => {
    navigate('/super-admin');
    setIsOpen(false);
  };

  const handleJobsClick = () => {
    navigate('/jobs');
    setIsOpen(false);
  };

  const handleEmailSettingsClick = () => {
    navigate('/email-settings');
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              User Settings
            </CardTitle>
            {user && (
              <p className="text-sm text-muted-foreground">{user.username} • {user.email}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Super Admin Dashboard Link */}
            {isAdmin && (
              <>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleSuperAdminClick}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Platform Analytics
                </Button>
                <Separator />
              </>
            )}

            {/* Admin Dashboard Link */}
            {isOrgAdmin && (
              <>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleAdminClick}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Dashboard
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleJobsClick}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Manage Jobs
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleEmailSettingsClick}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email Settings
                </Button>
                <Separator />
              </>
            )}

            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="theme-toggle" className="text-sm font-medium">
                  Dark Mode
                </Label>
                <div className="text-xs text-muted-foreground">
                  Toggle between light and dark themes
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Sun className="h-4 w-4" />
                <Switch
                  id="theme-toggle"
                  checked={isDarkMode}
                  onCheckedChange={onThemeChange}
                />
                <Moon className="h-4 w-4" />
              </div>
            </div>

            <Separator />

            {/* Filament Runout Setting */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="filament-pause" className="text-sm font-medium">
                  Pause on Filament Runout
                </Label>
                <div className="text-xs text-muted-foreground">
                  Automatically pause prints when filament runs out
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4" />
                <Switch
                  id="filament-pause"
                  checked={pauseOnFilamentOut}
                  onCheckedChange={onPauseOnFilamentOutChange}
                />
              </div>
            </div>

            <Separator />

            {/* Work Hours Configuration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <Label className="text-sm font-medium">
                  Worker Hours
                </Label>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Set hours when workers are available for print management
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="work-start" className="text-xs">Start</Label>
                  <Select 
                    value={farmWorkHours.start.toString()} 
                    onValueChange={(value) => onFarmWorkHoursChange({ ...farmWorkHours, start: parseInt(value) })}
                  >
                    <SelectTrigger id="work-start" className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="work-end" className="text-xs">End</Label>
                  <Select 
                    value={farmWorkHours.end.toString()} 
                    onValueChange={(value) => onFarmWorkHoursChange({ ...farmWorkHours, end: parseInt(value) })}
                  >
                    <SelectTrigger id="work-end" className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Current: {farmWorkHours.start === 0 ? '12 AM' : farmWorkHours.start < 12 ? `${farmWorkHours.start} AM` : farmWorkHours.start === 12 ? '12 PM' : `${farmWorkHours.start - 12} PM`}
                {' - '}
                {farmWorkHours.end === 0 ? '12 AM' : farmWorkHours.end < 12 ? `${farmWorkHours.end} AM` : farmWorkHours.end === 12 ? '12 PM' : `${farmWorkHours.end - 12} PM`}
              </div>
            </div>

            <Separator />

            {/* Sign Out Button */}
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}