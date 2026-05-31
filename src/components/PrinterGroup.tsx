import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PrinterGroup as PrinterGroupType, Printer, BatchCommand } from "@/types/printer";
import { useState, useRef } from "react";
import { Folder, Play, Pause, Square, Home, Flame, Snowflake, Plus, Minus, Trash2, Edit, Palette, Upload, Image } from "lucide-react";

interface PrinterGroupProps {
  group: PrinterGroupType;
  printers: Printer[];
  onBatchCommand: (groupId: string, command: BatchCommand) => void;
  onToggleExpanded: (groupId: string) => void;
  isExpanded: boolean;
  selectedPrinters: string[];
  onAddPrinter?: (groupId: string) => void;
  onRemovePrinter?: (groupId: string, printerId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onEditGroup?: (groupId: string, newName: string, newColor: string) => void;
  onGroupColorChange?: (groupId: string, color: string) => void;
  onGroupIconUpload?: (groupId: string, file: File) => void;
}

export function PrinterGroup({ 
  group, 
  printers, 
  onBatchCommand, 
  onToggleExpanded,
  isExpanded,
  selectedPrinters,
  onAddPrinter,
  onRemovePrinter,
  onDeleteGroup,
  onEditGroup,
  onGroupColorChange,
  onGroupIconUpload
}: PrinterGroupProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(group.name);
  const [editedColor, setEditedColor] = useState(group.color);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const groupPrinters = printers.filter(printer => printer.groupIds.includes(group.id));
  const onlineCount = groupPrinters.filter(p => p.status !== 'offline').length;
  const printingCount = groupPrinters.filter(p => p.status === 'printing').length;
  const selectedInGroup = selectedPrinters.filter(id => 
    groupPrinters.some(p => p.id === id)
  ).length;

  const handleEditGroup = () => {
    if (isEditingName && editedName.trim() !== group.name) {
      onEditGroup?.(group.id, editedName.trim(), editedColor);
    }
    setIsEditingName(!isEditingName);
  };
  
  const handleColorChange = (color: string) => {
    setEditedColor(color);
    onGroupColorChange?.(group.id, color);
    onEditGroup?.(group.id, editedName, color);
  };
  
  const handleIconUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onGroupIconUpload) {
      onGroupIconUpload(group.id, file);
    }
  };

  const colorOptions = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
  ];

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onToggleExpanded(group.id)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {group.icon ? (
              <img src={group.icon} alt="Group icon" className="h-5 w-5 rounded object-cover" />
            ) : (
              <Folder className="h-5 w-5" style={{ color: isEditingName ? editedColor : group.color }} />
            )}
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleEditGroup}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditGroup()}
                  className="bg-background border rounded px-2 py-1 text-lg font-semibold"
                  autoFocus
                />
                   <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    {colorOptions.map(color => (
                       <button
                         key={color}
                         className={`w-4 h-4 rounded-full border-2 ${editedColor === color ? 'border-foreground' : 'border-muted'}`}
                         style={{ backgroundColor: color }}
                         onMouseDown={(e) => {
                           e.stopPropagation();
                           e.preventDefault();
                         }}
                         onClick={(e) => {
                           e.stopPropagation();
                           e.preventDefault();
                           handleColorChange(color);
                         }}
                       />
                     ))}
                   </div>
                   <Button
                     size="sm"
                     variant="outline"
                     onMouseDown={(e) => {
                       e.stopPropagation();
                       e.preventDefault();
                     }}
                     onClick={(e) => {
                       e.stopPropagation();
                       e.preventDefault();
                       fileInputRef.current?.click();
                     }}
                   >
                     <Upload className="h-3 w-3" />
                   </Button>
                 <input
                   ref={fileInputRef}
                   type="file"
                   accept="image/*"
                   onChange={handleIconUpload}
                   style={{ display: 'none' }}
                 />
               </div>
            ) : (
              <span 
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditGroup();
                }} 
                className="cursor-pointer hover:text-primary"
              >
                {group.name}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedInGroup > 0 && (
              <Badge variant="secondary">
                {selectedInGroup} selected
              </Badge>
            )}
            <Badge variant="outline">
              {onlineCount}/{groupPrinters.length} online
            </Badge>
            {printingCount > 0 && (
              <Badge className="bg-status-printing text-white">
                {printingCount} printing
              </Badge>
            )}
            <div className="flex gap-1">
              {onEditGroup && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              {onAddPrinter && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddPrinter(group.id);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              {onDeleteGroup && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Group</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{group.name}"? This action cannot be undone.
                        {groupPrinters.length > 0 && (
                          <span className="block mt-2 text-destructive font-medium">
                            This group still contains {groupPrinters.length} printer(s). Remove them first.
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDeleteGroup(group.id)}
                        disabled={groupPrinters.length > 0}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="flex gap-2 flex-wrap mb-4">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'pause')}
              disabled={printingCount === 0}
            >
              <Pause className="h-4 w-4 mr-1" />
              Pause All
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'resume')}
              disabled={groupPrinters.filter(p => p.status === 'paused').length === 0}
            >
              <Play className="h-4 w-4 mr-1" />
              Resume All
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'stop')}
              disabled={groupPrinters.filter(p => p.status === 'printing' || p.status === 'paused').length === 0}
            >
              <Square className="h-4 w-4 mr-1" />
              Stop All
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'home')}
              disabled={groupPrinters.filter(p => p.status === 'online').length === 0}
            >
              <Home className="h-4 w-4 mr-1" />
              Home All
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'preheat')}
              disabled={groupPrinters.filter(p => p.status === 'online').length === 0}
            >
              <Flame className="h-4 w-4 mr-1" />
              Preheat All
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onBatchCommand(group.id, 'cooldown')}
              disabled={groupPrinters.filter(p => p.temperature.nozzle > 50).length === 0}
            >
              <Snowflake className="h-4 w-4 mr-1" />
              Cool All
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm font-medium">Printers in this group:</div>
            <div className="flex flex-wrap gap-2">
              {groupPrinters.map(printer => (
                <div key={printer.id} className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
                  <span className="text-sm">{printer.name}</span>
                  {onRemovePrinter && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-auto p-0 w-4 h-4"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Printer</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove "{printer.name}" from this group?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRemovePrinter(group.id, printer.id)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
              {groupPrinters.length === 0 && (
                <div className="text-sm text-muted-foreground">No printers in this group</div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}