import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FilamentInventoryItem, Printer } from "@/types/printer";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Minus,
  Trash2, 
  Package, 
  PackageOpen, 
  Edit, 
  Printer as PrinterIcon,
  ChevronRight,
  ChevronDown,
  BarChart3,
  TrendingDown,
  Droplet
} from "lucide-react";

interface FilamentInventoryProps {
  inventory: FilamentInventoryItem[];
  printers: Printer[];
  onAddFilament: (filament: Omit<FilamentInventoryItem, 'id'>) => void;
  onUpdateFilament: (id: string, updates: Partial<FilamentInventoryItem>) => void;
  onDeleteFilament: (id: string) => void;
  onLoadFilamentToPrinter: (filamentId: string, printerId: string) => void;
}

export function FilamentInventory({ 
  inventory, 
  printers, 
  onAddFilament, 
  onUpdateFilament, 
  onDeleteFilament,
  onLoadFilamentToPrinter
}: FilamentInventoryProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingFilament, setEditingFilament] = useState<FilamentInventoryItem | null>(null);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickEditValue, setQuickEditValue] = useState<number>(0);
  const [editingNewSpoolsKey, setEditingNewSpoolsKey] = useState<string | null>(null);
  const [editingNewSpoolsCount, setEditingNewSpoolsCount] = useState<number>(0);
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);
  const [selectedFilamentForLoad, setSelectedFilamentForLoad] = useState<string | null>(null);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [addMode, setAddMode] = useState<'filament' | 'resin'>('filament');
  const [useCustomType, setUseCustomType] = useState(false);
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [useCustomBrand, setUseCustomBrand] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterColor, setFilterColor] = useState<string>('all');
  const { toast } = useToast();

  const existingBrands = [...new Set(inventory.map(item => item.brand))].sort();

  const [newFilament, setNewFilament] = useState({
    type: 'PLA',
    brand: '',
    color: '',
    diameter: 1.75,
    totalCapacity: 1000,
    used: 0,
    status: 'new' as const,
    purchaseDate: '',
    cost: 0,
    location: '',
    spoolCount: 1
  });

  const filamentTypes = ['PLA', 'ABS', 'PETG', 'TPU', 'ASA', 'HIPS', 'Wood Fill', 'Metal Fill', 'Carbon Fiber'];
  const resinTypes = ['Standard Resin', 'Tough Resin', 'Flexible Resin', 'Clear Resin', 'Castable Resin'];
  const filamentColors = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Orange', 'Purple', 'Pink', 'Gray', 'Clear', 'Silver', 'Gold'];

  const isResinType = (materialType: string) => materialType.toLowerCase().includes('resin');

  // Filter inventory based on filters
  const filteredInventory = inventory.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterBrand !== 'all' && item.brand !== filterBrand) return false;
    if (filterColor !== 'all' && item.color !== filterColor) return false;
    return true;
  });

  // Get unique values for filters
  const availableTypes = [...new Set(inventory.map(item => item.type))].sort();
  const availableBrands = [...new Set(inventory.map(item => item.brand))].sort();
  const availableColors = [...new Set(inventory.map(item => item.color))].sort();

  // Group filaments by brand, type, and color for spool counting
  const groupedInventory = filteredInventory.reduce((acc, item) => {
    const key = `${item.brand}-${item.type}-${item.color}`;
    if (!acc[key]) {
      acc[key] = {
        brand: item.brand,
        type: item.type,
        color: item.color,
        diameter: item.diameter,
        totalCapacity: item.totalCapacity,
        newSpools: 0,
        newSpoolItems: [],
        partialSpools: [],
        cost: item.cost || 0,
        location: item.location || ''
      };
    }
    
    if (item.status === 'new') {
      acc[key].newSpools += 1;
      acc[key].newSpoolItems.push({
        id: item.id,
        remaining: item.remaining,
        used: item.used
      });
    } else if (item.status === 'partially-used') {
      acc[key].partialSpools.push({
        id: item.id,
        remaining: item.remaining,
        used: item.used
      });
    }
    
    return acc;
  }, {} as Record<string, {
    brand: string;
    type: string;
    color: string;
    diameter: number;
    totalCapacity: number;
    newSpools: number;
    newSpoolItems: { id: string; remaining: number; used: number; }[];
    partialSpools: { id: string; remaining: number; used: number; }[];
    cost: number;
    location: string;
  }>);

  // Sort grouped inventory by type then alphabetical order
  const sortedGroupedInventory = Object.entries(groupedInventory)
    .sort(([, a], [, b]) => {
      // First sort by type
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      // Then by brand
      if (a.brand !== b.brand) {
        return a.brand.localeCompare(b.brand);
      }
      // Finally by color
      return a.color.localeCompare(b.color);
    });

  const filamentGroups = sortedGroupedInventory.filter(([, group]) => !isResinType(group.type));
  const resinGroups = sortedGroupedInventory.filter(([, group]) => isResinType(group.type));

  const newSpools = inventory.filter(item => item.status === 'new');
  const partiallyUsedSpools = inventory.filter(item => item.status === 'partially-used');
  const filamentInventory = inventory.filter(item => !isResinType(item.type));
  const resinInventory = inventory.filter(item => isResinType(item.type));
  const filamentWeight = filamentInventory.reduce((sum, item) => sum + item.remaining, 0);
  const resinVolume = resinInventory.reduce((sum, item) => sum + item.remaining, 0);
  const totalValue = inventory.reduce((sum, item) => sum + (item.cost || 0), 0);
  const filamentTypesAvailable = availableTypes.filter(type => !isResinType(type));
  const resinTypesAvailable = availableTypes.filter(type => isResinType(type));

  const [reorderThresholds, setReorderThresholds] = useState<Record<string, {
    mode: 'percent' | 'spools';
    percent: number;
    spools: number;
  }>>({});
  const [defaultThreshold, setDefaultThreshold] = useState({
    mode: 'percent' as 'percent' | 'spools',
    percent: 20,
    spools: 2
  });

  useEffect(() => {
    const savedThresholds = localStorage.getItem('materialReorderThresholds');
    const savedDefaults = localStorage.getItem('materialReorderDefault');

    if (savedThresholds) {
      try {
        const parsed = JSON.parse(savedThresholds) as Record<string, {
          mode: 'percent' | 'spools';
          percent: number;
          spools: number;
        }>;
        setReorderThresholds(parsed);
      } catch {
        // Ignore invalid storage entries.
      }
    }

    if (savedDefaults) {
      try {
        const parsed = JSON.parse(savedDefaults) as {
          mode: 'percent' | 'spools';
          percent: number;
          spools: number;
        };
        setDefaultThreshold(parsed);
      } catch {
        // Ignore invalid storage entries.
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('materialReorderThresholds', JSON.stringify(reorderThresholds));
  }, [reorderThresholds]);

  useEffect(() => {
    localStorage.setItem('materialReorderDefault', JSON.stringify(defaultThreshold));
  }, [defaultThreshold]);

  useEffect(() => {
    const allTypes = [...filamentTypesAvailable, ...resinTypesAvailable];
    setReorderThresholds(prev => {
      const next = { ...prev };
      let changed = false;

      allTypes.forEach(type => {
        if (!next[type]) {
          next[type] = { ...defaultThreshold };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [filamentTypesAvailable.join('|'), resinTypesAvailable.join('|'), defaultThreshold]);

  const buildTypeStats = (items: FilamentInventoryItem[]) => {
    return items.reduce((acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = { totalCapacity: 0, remaining: 0, totalSpools: 0 };
      }

      acc[item.type].totalCapacity += item.totalCapacity;
      acc[item.type].remaining += item.remaining;
      if (item.remaining > 0) {
        acc[item.type].totalSpools += 1;
      }

      return acc;
    }, {} as Record<string, { totalCapacity: number; remaining: number; totalSpools: number }>);
  };

  const filamentTypeStats = buildTypeStats(filamentInventory);
  const resinTypeStats = buildTypeStats(resinInventory);

  const isBelowThreshold = (
    materialType: string,
    stats: Record<string, { totalCapacity: number; remaining: number; totalSpools: number }>
  ) => {
    const threshold = reorderThresholds[materialType];
    const typeStats = stats[materialType];

    if (!threshold || !typeStats) return false;

    if (threshold.mode === 'spools') {
      return typeStats.totalSpools <= threshold.spools;
    }

    const percentRemaining = typeStats.totalCapacity > 0
      ? (typeStats.remaining / typeStats.totalCapacity) * 100
      : 0;

    return percentRemaining <= threshold.percent;
  };

  const lowFilamentTypes = filamentTypesAvailable.filter(type => isBelowThreshold(type, filamentTypeStats));
  const lowResinTypes = resinTypesAvailable.filter(type => isBelowThreshold(type, resinTypeStats));

  const handleAddFilament = () => {
    const spoolCount = newFilament.spoolCount || 1;
    
    // Use addMode to determine if this is resin or filament
    const isResin = addMode === 'resin';

    for (let i = 0; i < spoolCount; i++) {
      const filament: Omit<FilamentInventoryItem, 'id'> = {
        type: newFilament.type,
        brand: newFilament.brand,
        color: newFilament.color,
        diameter: isResin ? 0 : newFilament.diameter,
        totalCapacity: newFilament.totalCapacity,
        used: newFilament.used,
        remaining: newFilament.totalCapacity - newFilament.used,
        status: newFilament.status,
        purchaseDate: newFilament.purchaseDate,
        cost: newFilament.cost,
        location: newFilament.location
      };
      onAddFilament(filament);
    }
    
    setNewFilament({
      type: 'PLA',
      brand: '',
      color: '',
      diameter: 1.75,
      totalCapacity: 1000,
      used: 0,
      status: 'new',
      purchaseDate: '',
      cost: 0,
      location: '',
      spoolCount: 1
    });
    setUseCustomType(false);
    setUseCustomColor(false);
    setUseCustomBrand(false);
    setShowAddDialog(false);
    toast({
      title: isResin ? "Resin added" : "Filament spools added",
      description: isResin
        ? `${spoolCount} container(s) of ${newFilament.brand} ${newFilament.type} (${newFilament.color}) added to inventory`
        : `${spoolCount} spool(s) of ${newFilament.brand} ${newFilament.type} (${newFilament.color}) added to inventory`,
    });
  };

  const handleUpdateFilament = () => {
    if (editingFilament) {
      const updates = {
        ...editingFilament,
        remaining: editingFilament.totalCapacity - editingFilament.used
      };
      onUpdateFilament(editingFilament.id, updates);
      setEditingFilament(null);
      toast({
        title: "Filament updated",
        description: "Filament information has been updated",
      });
    }
  };

  const handleLoadFilament = (printerId: string) => {
    if (selectedFilamentForLoad) {
      onLoadFilamentToPrinter(selectedFilamentForLoad, printerId);
      setShowLoadDialog(false);
      setSelectedFilamentForLoad(null);
      
      const filament = inventory.find(f => f.id === selectedFilamentForLoad);
      const printer = printers.find(p => p.id === printerId);
      toast({
        title: "Filament loaded",
        description: `${filament?.brand} ${filament?.type} loaded to ${printer?.name}`,
      });
    }
  };

  const handleQuickEditSave = (filamentId: string) => {
    const filament = inventory.find(f => f.id === filamentId);
    if (filament) {
      onUpdateFilament(filamentId, {
        remaining: quickEditValue,
        used: filament.totalCapacity - quickEditValue
      });
      setQuickEditId(null);
      toast({
        title: "Quantity updated",
        description: `${filament.brand} ${filament.type} quantity updated to ${quickEditValue}${isResinType(filament.type) ? 'ml' : 'g'}`,
      });
    }
  };

  const toggleBrandExpansion = (brandType: string) => {
    setExpandedBrands(prev => 
      prev.includes(brandType) 
        ? prev.filter(bt => bt !== brandType)
        : [...prev, brandType]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-success text-success-foreground';
      case 'partially-used': return 'bg-warning text-warning-foreground';
      case 'empty': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spools</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventory.length}</div>
            <p className="text-xs text-muted-foreground">
              {newSpools.length} new, {partiallyUsedSpools.length} partial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Filament Weight</CardTitle>
            <PackageOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(filamentWeight / 1000).toFixed(1)}kg</div>
            <p className="text-xs text-muted-foreground">
              Available filament
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resin Volume</CardTitle>
            <PackageOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(resinVolume / 1000).toFixed(1)}L</div>
            <p className="text-xs text-muted-foreground">
              Available resin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Inventory value
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Add Filament</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button
                  className="w-full"
                  onClick={() => {
                    setAddMode('filament');
                    setUseCustomType(false);
                    setUseCustomColor(false);
                    setUseCustomBrand(false);
                    setNewFilament(prev => ({
                      ...prev,
                      type: filamentTypes[0] || 'PLA',
                      diameter: 1.75
                    }));
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Filament
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{addMode === 'resin' ? 'Add New Resin' : 'Add New Filament'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={useCustomType ? 'custom' : newFilament.type}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setUseCustomType(true);
                            setNewFilament({ ...newFilament, type: '' });
                            return;
                          }
                          setUseCustomType(false);
                          setNewFilament({ ...newFilament, type: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={addMode === 'resin' ? 'Select resin type' : 'Select filament type'} />
                        </SelectTrigger>
                        <SelectContent>
                          {(addMode === 'resin' ? resinTypes : filamentTypes).map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                      {useCustomType && (
                        <Input
                          className="mt-2"
                          value={newFilament.type}
                          onChange={(e) => setNewFilament({ ...newFilament, type: e.target.value })}
                          placeholder={addMode === 'resin' ? 'Enter resin type' : 'Enter filament type'}
                        />
                      )}
                    </div>
                    <div>
                      <Label htmlFor="color">Color</Label>
                      <Select
                        value={useCustomColor ? 'custom' : newFilament.color}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setUseCustomColor(true);
                            setNewFilament({ ...newFilament, color: '' });
                            return;
                          }
                          setUseCustomColor(false);
                          setNewFilament({ ...newFilament, color: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          {filamentColors.map(color => (
                            <SelectItem key={color} value={color}>{color}</SelectItem>
                          ))}
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                      {useCustomColor && (
                        <Input
                          className="mt-2"
                          value={newFilament.color}
                          onChange={(e) => setNewFilament({ ...newFilament, color: e.target.value })}
                          placeholder="Enter color"
                        />
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Select
                      value={useCustomBrand ? 'custom' : newFilament.brand}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setUseCustomBrand(true);
                          setNewFilament({ ...newFilament, brand: '' });
                          return;
                        }
                        setUseCustomBrand(false);
                        setNewFilament({ ...newFilament, brand: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {existingBrands.map(brand => (
                          <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {useCustomBrand && (
                      <Input
                        className="mt-2"
                        value={newFilament.brand}
                        onChange={(e) => setNewFilament({ ...newFilament, brand: e.target.value })}
                        placeholder="Enter brand"
                      />
                    )}
                  </div>

                  <div>
                    <Label htmlFor="spoolCount">Number of {addMode === 'resin' ? 'Containers' : 'Spools'}</Label>
                    <Input
                      id="spoolCount"
                      type="number"
                      min="1"
                      value={newFilament.spoolCount || 1}
                      onChange={(e) => setNewFilament({...newFilament, spoolCount: parseInt(e.target.value)})}
                      placeholder="1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {addMode !== 'resin' && (
                      <div>
                        <Label htmlFor="diameter">Diameter (mm)</Label>
                        <Select value={newFilament.diameter.toString()} onValueChange={(value) => setNewFilament({...newFilament, diameter: parseFloat(value)})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1.75">1.75mm</SelectItem>
                            <SelectItem value="3.0">3.0mm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="weight">
                        {addMode === 'resin' ? 'Volume (ml)' : 'Weight (g)'}
                      </Label>
                      <Input
                        id="weight"
                        type="number"
                        value={newFilament.totalCapacity}
                        onChange={(e) => setNewFilament({...newFilament, totalCapacity: parseInt(e.target.value)})}
                        placeholder="1000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="cost">Cost ($)</Label>
                      <Input
                        id="cost"
                        type="number"
                        step="0.01"
                        value={newFilament.cost}
                        onChange={(e) => setNewFilament({...newFilament, cost: parseFloat(e.target.value)})}
                        placeholder="25.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={newFilament.location}
                        onChange={(e) => setNewFilament({...newFilament, location: e.target.value})}
                        placeholder="Shelf A1"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                  <Button onClick={handleAddFilament} disabled={!newFilament.brand || !newFilament.color}>Add {addMode === 'resin' ? 'Resin' : 'Filament'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Add Resin</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => {
                setAddMode('resin');
                setUseCustomType(false);
                setUseCustomColor(false);
                setUseCustomBrand(false);
                setNewFilament(prev => ({
                  ...prev,
                  type: resinTypes[0] || 'Standard Resin',
                  diameter: 0
                }));
                setShowAddDialog(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Resin
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Load to Printer</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <PrinterIcon className="h-3 w-3 mr-1" />
                  Load to Printer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Load Filament to Printer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select Material</Label>
                    <Select value={selectedFilamentForLoad ? inventory.find(f => f.id === selectedFilamentForLoad)?.brand + '|' + inventory.find(f => f.id === selectedFilamentForLoad)?.type + '|' + inventory.find(f => f.id === selectedFilamentForLoad)?.color || '' : ''} onValueChange={(groupKey) => {
                      const [brand, type, color] = groupKey.split('|');
                      const firstSpool = inventory.find(f => f.brand === brand && f.type === type && f.color === color && f.remaining > 0);
                      if (firstSpool) setSelectedFilamentForLoad(firstSpool.id);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose material" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set(
                          inventory
                            .filter(f => f.remaining > 0)
                            .map(f => `${f.brand}|${f.type}|${f.color}`)
                        )).map(groupKey => {
                          const [brand, type, color] = groupKey.split('|');
                          const count = inventory.filter(f => f.brand === brand && f.type === type && f.color === color && f.remaining > 0).length;
                          return (
                            <SelectItem key={groupKey} value={groupKey}>
                              {brand} {type} ({color}) - {count} available
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedFilamentForLoad && (
                    <div>
                      <Label>Select Specific Spool</Label>
                      <div className="grid gap-2 max-h-40 overflow-y-auto border rounded-md p-2">
                        {inventory
                          .filter(f => f.remaining > 0 && 
                            (() => {
                              const selected = inventory.find(s => s.id === selectedFilamentForLoad);
                              return f.brand === selected?.brand && f.type === selected?.type && f.color === selected?.color;
                            })()
                          )
                          .map(filament => (
                            <Button
                              key={filament.id}
                              variant={selectedFilamentForLoad === filament.id ? "default" : "outline"}
                              className="justify-start text-sm"
                              onClick={() => setSelectedFilamentForLoad(filament.id)}
                            >
                              {filament.remaining}{isResinType(filament.type) ? 'ml' : 'g'} remaining {selectedFilamentForLoad === filament.id ? '(selected)' : ''}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label>Select Printer</Label>
                    <div className="grid gap-2 mt-2">
                      {printers.map(printer => (
                        <Button
                          key={printer.id}
                          variant="outline"
                          className="justify-start"
                          onClick={() => handleLoadFilament(printer.id)}
                          disabled={!selectedFilamentForLoad}
                        >
                          <PrinterIcon className="h-4 w-4 mr-2" />
                          {printer.name} - {printer.status}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Usage Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="text-sm font-medium mb-3">Filament Usage by Type</h4>
              {filamentTypesAvailable.length === 0 ? (
                <div className="text-sm text-muted-foreground">No filament usage data yet.</div>
              ) : (
                <div className="space-y-3">
                  {filamentTypesAvailable.map(type => {
                    const typeInventory = filamentInventory.filter(item => item.type === type);
                    const totalCapacity = typeInventory.reduce((sum, item) => sum + item.totalCapacity, 0);
                    const totalUsed = typeInventory.reduce((sum, item) => sum + item.used, 0);
                    const usagePercentage = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;
                    
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{type}</span>
                          <span className="text-muted-foreground">{usagePercentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Used: {(totalUsed / 1000).toFixed(1)}kg</span>
                          <span>Total: {(totalCapacity / 1000).toFixed(1)}kg</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Resin Usage by Type</h4>
              {resinTypesAvailable.length === 0 ? (
                <div className="text-sm text-muted-foreground">No resin usage data yet.</div>
              ) : (
                <div className="space-y-3">
                  {resinTypesAvailable.map(type => {
                    const typeInventory = resinInventory.filter(item => item.type === type);
                    const totalCapacity = typeInventory.reduce((sum, item) => sum + item.totalCapacity, 0);
                    const totalUsed = typeInventory.reduce((sum, item) => sum + item.used, 0);
                    const usagePercentage = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;
                    
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{type}</span>
                          <span className="text-muted-foreground">{usagePercentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Used: {(totalUsed / 1000).toFixed(1)}L</span>
                          <span>Total: {(totalCapacity / 1000).toFixed(1)}L</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Inventory Status</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">Filament Spools</div>
                    <div className="text-xs text-muted-foreground">New + partial</div>
                  </div>
                  <div className="text-lg font-bold">{filamentInventory.length}</div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">Resin Containers</div>
                    <div className="text-xs text-muted-foreground">New + partial</div>
                  </div>
                  <div className="text-lg font-bold">{resinInventory.length}</div>
                </div>

                <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-success">Total Materials</div>
                    <div className="text-xs text-muted-foreground">All inventory items</div>
                  </div>
                  <div className="text-lg font-bold text-success">{inventory.length}</div>
                </div>

                <div className="p-3 border rounded-lg space-y-4">
                  <div className="text-sm font-medium">Reorder Thresholds</div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Default for new types</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={defaultThreshold.mode}
                        onValueChange={(value) => setDefaultThreshold(prev => ({
                          ...prev,
                          mode: value as 'percent' | 'spools'
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">% remaining</SelectItem>
                          <SelectItem value="spools">Spools remaining</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        max={defaultThreshold.mode === 'percent' ? '100' : undefined}
                        value={defaultThreshold.mode === 'percent' ? defaultThreshold.percent : defaultThreshold.spools}
                        onChange={(e) => {
                          const parsed = Number(e.target.value || 0);
                          setDefaultThreshold(prev => ({
                            ...prev,
                            percent: defaultThreshold.mode === 'percent' ? parsed : prev.percent,
                            spools: defaultThreshold.mode === 'spools' ? parsed : prev.spools
                          }));
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Applies automatically when a new material type appears.
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">Filament</div>
                    {filamentTypesAvailable.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No filament types available.</div>
                    ) : (
                      <div className="space-y-3">
                        {filamentTypesAvailable.map(type => {
                          const threshold = reorderThresholds[type] || { mode: 'percent', percent: 20, spools: 2 };
                          const stats = filamentTypeStats[type];
                          const percentRemaining = stats && stats.totalCapacity > 0
                            ? (stats.remaining / stats.totalCapacity) * 100
                            : 0;

                          return (
                            <div key={type} className="space-y-2 rounded-md border p-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{type}</span>
                                <Badge variant={isBelowThreshold(type, filamentTypeStats) ? 'destructive' : 'outline'}>
                                  {isBelowThreshold(type, filamentTypeStats) ? 'Reorder' : 'OK'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Select
                                  value={threshold.mode}
                                  onValueChange={(value) => setReorderThresholds(prev => ({
                                    ...prev,
                                    [type]: {
                                      ...(prev[type] || { mode: 'percent', percent: 20, spools: 2 }),
                                      mode: value as 'percent' | 'spools'
                                    }
                                  }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percent">% remaining</SelectItem>
                                    <SelectItem value="spools">Spools remaining</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min="0"
                                  max={threshold.mode === 'percent' ? '100' : undefined}
                                  value={threshold.mode === 'percent' ? threshold.percent : threshold.spools}
                                  onChange={(e) => {
                                    const parsed = Number(e.target.value || 0);
                                    setReorderThresholds(prev => ({
                                      ...prev,
                                      [type]: {
                                        ...(prev[type] || { mode: 'percent', percent: 20, spools: 2 }),
                                        percent: threshold.mode === 'percent' ? parsed : (prev[type]?.percent ?? 20),
                                        spools: threshold.mode === 'spools' ? parsed : (prev[type]?.spools ?? 2)
                                      }
                                    }));
                                  }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Remaining: {stats?.totalSpools ?? 0} spools, {percentRemaining.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">Resin</div>
                    {resinTypesAvailable.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No resin types available.</div>
                    ) : (
                      <div className="space-y-3">
                        {resinTypesAvailable.map(type => {
                          const threshold = reorderThresholds[type] || { mode: 'percent', percent: 20, spools: 2 };
                          const stats = resinTypeStats[type];
                          const percentRemaining = stats && stats.totalCapacity > 0
                            ? (stats.remaining / stats.totalCapacity) * 100
                            : 0;

                          return (
                            <div key={type} className="space-y-2 rounded-md border p-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{type}</span>
                                <Badge variant={isBelowThreshold(type, resinTypeStats) ? 'destructive' : 'outline'}>
                                  {isBelowThreshold(type, resinTypeStats) ? 'Reorder' : 'OK'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Select
                                  value={threshold.mode}
                                  onValueChange={(value) => setReorderThresholds(prev => ({
                                    ...prev,
                                    [type]: {
                                      ...(prev[type] || { mode: 'percent', percent: 20, spools: 2 }),
                                      mode: value as 'percent' | 'spools'
                                    }
                                  }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percent">% remaining</SelectItem>
                                    <SelectItem value="spools">Containers remaining</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min="0"
                                  max={threshold.mode === 'percent' ? '100' : undefined}
                                  value={threshold.mode === 'percent' ? threshold.percent : threshold.spools}
                                  onChange={(e) => {
                                    const parsed = Number(e.target.value || 0);
                                    setReorderThresholds(prev => ({
                                      ...prev,
                                      [type]: {
                                        ...(prev[type] || { mode: 'percent', percent: 20, spools: 2 }),
                                        percent: threshold.mode === 'percent' ? parsed : (prev[type]?.percent ?? 20),
                                        spools: threshold.mode === 'spools' ? parsed : (prev[type]?.spools ?? 2)
                                      }
                                    }));
                                  }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Remaining: {stats?.totalSpools ?? 0} containers, {percentRemaining.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-warning">
                      <TrendingDown className="h-3 w-3" />
                      Below Threshold
                    </div>
                    {lowFilamentTypes.length === 0 && lowResinTypes.length === 0 ? (
                      <div className="text-xs text-muted-foreground">All materials are above their reorder levels.</div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        {lowFilamentTypes.map(type => (
                          <div key={`filament-${type}`} className="text-warning">{type} (filament)</div>
                        ))}
                        {lowResinTypes.map(type => (
                          <div key={`resin-${type}`} className="text-warning">{type} (resin)</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Filters</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {availableTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {availableBrands.map(brand => (
                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterColor} onValueChange={setFilterColor}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colors</SelectItem>
                {availableColors.map(color => (
                  <SelectItem key={color} value={color}>{color}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              onClick={() => {
                setFilterType('all');
                setFilterBrand('all');
                setFilterColor('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-sm font-medium">Filament</div>
              {filamentGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">No filament spools in inventory.</div>
              ) : (
                <div className="space-y-4">
                  {filamentGroups.map(([key, groupData]) => {
                    const isExpanded = expandedBrands.includes(key);
                    const unit = 'g';
                    return (
                      <div key={key} className="border rounded-lg p-4">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => toggleBrandExpansion(key)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <div 
                              className="w-4 h-4 rounded-full border-2 border-white shadow-sm" 
                              style={{ backgroundColor: groupData.color.toLowerCase() === 'white' ? '#f8f9fa' : groupData.color.toLowerCase() }}
                            />
                            <h3 className="font-semibold">{groupData.brand} {groupData.type} ({groupData.color})</h3>
                            <Badge variant="secondary">{groupData.newSpools} new</Badge>
                            <Badge variant="outline">{groupData.partialSpools.length} partial</Badge>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{groupData.diameter}mm</span>
                            <span className="text-sm font-medium">{groupData.totalCapacity}{unit}</span>
                            {groupData.cost > 0 && <span className="text-sm text-muted-foreground">${groupData.cost}</span>}
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 space-y-3">
                            {groupData.newSpools > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 pl-6">
                                  <Package className="h-4 w-4 text-success" />
                                  {editingNewSpoolsKey === key ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm font-medium">New Spools:</span>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editingNewSpoolsCount}
                                        onChange={(e) => setEditingNewSpoolsCount(parseInt(e.target.value) || 0)}
                                        className="w-16 h-7"
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const diff = editingNewSpoolsCount - groupData.newSpools;
                                          if (diff > 0) {
                                            for (let i = 0; i < diff; i++) {
                                              onAddFilament({
                                                type: groupData.type,
                                                brand: groupData.brand,
                                                color: groupData.color,
                                                diameter: groupData.diameter,
                                                totalCapacity: groupData.totalCapacity,
                                                used: 0,
                                                remaining: groupData.totalCapacity,
                                                status: 'new',
                                                purchaseDate: '',
                                                cost: 0,
                                                location: ''
                                              });
                                            }
                                          } else if (diff < 0) {
                                            const toDelete = groupData.newSpoolItems.slice(0, Math.abs(diff));
                                            toDelete.forEach(item => onDeleteFilament(item.id));
                                          }
                                          setEditingNewSpoolsKey(null);
                                        }}
                                        className="h-7"
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingNewSpoolsKey(null)}
                                        className="h-7"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-sm font-medium text-success cursor-pointer hover:opacity-80"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingNewSpoolsKey(key);
                                        setEditingNewSpoolsCount(groupData.newSpools);
                                      }}
                                    >
                                      New Spools ({groupData.newSpools})
                                    </button>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {groupData.totalCapacity * groupData.newSpools}{unit} total capacity
                                </div>
                              </div>
                            )}
                            
                            {groupData.partialSpools.map((partial, index) => (
                              <div key={partial.id} className="pl-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <PackageOpen className="h-4 w-4 text-warning" />
                                    <span className="text-sm">Partial Spool {index + 1}</span>
                                    {quickEditId === partial.id ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          min="0"
                                          value={quickEditValue}
                                          onChange={(e) => setQuickEditValue(parseInt(e.target.value) || 0)}
                                          className="w-20 h-7"
                                          autoFocus
                                        />
                                        <span className="text-xs text-muted-foreground">{unit}</span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleQuickEditSave(partial.id)}
                                          className="h-7"
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setQuickEditId(null)}
                                          className="h-7"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <button 
                                        className="text-xs px-2 py-1 rounded border border-warning text-warning bg-warning/10 cursor-pointer hover:bg-warning/20 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuickEditId(partial.id);
                                          setQuickEditValue(partial.remaining);
                                        }}
                                      >
                                        {partial.remaining}{unit} remaining
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingFilament(inventory.find(f => f.id === partial.id) || null)}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="outline">
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Filament</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete this filament spool? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => onDeleteFilament(partial.id)}>
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {groupData.location && (
                              <div className="pl-6 text-sm text-muted-foreground">
                                Location: {groupData.location}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Resin</div>
              {resinGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">No resin materials in inventory.</div>
              ) : (
                <div className="space-y-4">
                  {resinGroups.map(([key, groupData]) => {
                    const isExpanded = expandedBrands.includes(key);
                    const unit = 'ml';
                    return (
                      <div key={key} className="border rounded-lg p-4">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => toggleBrandExpansion(key)}
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <div 
                              className="w-4 h-4 rounded-full border-2 border-white shadow-sm" 
                              style={{ backgroundColor: groupData.color.toLowerCase() === 'white' ? '#f8f9fa' : groupData.color.toLowerCase() }}
                            />
                            <h3 className="font-semibold">{groupData.brand} {groupData.type} ({groupData.color})</h3>
                            <Badge variant="secondary">{groupData.newSpools} new</Badge>
                            <Badge variant="outline">{groupData.partialSpools.length} partial</Badge>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{groupData.totalCapacity}{unit}</span>
                            {groupData.cost > 0 && <span className="text-sm text-muted-foreground">${groupData.cost}</span>}
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 space-y-3">
                            {groupData.newSpools > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2 pl-6">
                                  <Droplet className="h-4 w-4 text-blue-500" />
                                  {editingNewSpoolsKey === key ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm font-medium">New Containers:</span>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editingNewSpoolsCount}
                                        onChange={(e) => setEditingNewSpoolsCount(parseInt(e.target.value) || 0)}
                                        className="w-16 h-7"
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const diff = editingNewSpoolsCount - groupData.newSpools;
                                          if (diff > 0) {
                                            for (let i = 0; i < diff; i++) {
                                              onAddFilament({
                                                type: groupData.type,
                                                brand: groupData.brand,
                                                color: groupData.color,
                                                diameter: groupData.diameter,
                                                totalCapacity: groupData.totalCapacity,
                                                used: 0,
                                                remaining: groupData.totalCapacity,
                                                status: 'new',
                                                purchaseDate: '',
                                                cost: 0,
                                                location: ''
                                              });
                                            }
                                          } else if (diff < 0) {
                                            const toDelete = groupData.newSpoolItems.slice(0, Math.abs(diff));
                                            toDelete.forEach(item => onDeleteFilament(item.id));
                                          }
                                          setEditingNewSpoolsKey(null);
                                        }}
                                        className="h-7"
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingNewSpoolsKey(null)}
                                        className="h-7"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-sm font-medium text-blue-500 cursor-pointer hover:opacity-80"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingNewSpoolsKey(key);
                                        setEditingNewSpoolsCount(groupData.newSpools);
                                      }}
                                    >
                                      New Containers ({groupData.newSpools})
                                    </button>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {groupData.totalCapacity * groupData.newSpools}{unit} total capacity
                                </div>
                              </div>
                            )}
                            
                            {groupData.partialSpools.map((partial, index) => (
                              <div key={partial.id} className="pl-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <PackageOpen className="h-4 w-4 text-warning" />
                                    <span className="text-sm">Partial Container {index + 1}</span>
                                    {quickEditId === partial.id ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          min="0"
                                          value={quickEditValue}
                                          onChange={(e) => setQuickEditValue(parseInt(e.target.value) || 0)}
                                          className="w-20 h-7"
                                          autoFocus
                                        />
                                        <span className="text-xs text-muted-foreground">{unit}</span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleQuickEditSave(partial.id)}
                                          className="h-7"
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setQuickEditId(null)}
                                          className="h-7"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <button 
                                        className="text-xs px-2 py-1 rounded border border-warning text-warning bg-warning/10 cursor-pointer hover:bg-warning/20 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuickEditId(partial.id);
                                          setQuickEditValue(partial.remaining);
                                        }}
                                      >
                                        {partial.remaining}{unit} remaining
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingFilament(inventory.find(f => f.id === partial.id) || null)}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="outline">
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Resin</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete this resin container? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => onDeleteFilament(partial.id)}>
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {groupData.location && (
                              <div className="pl-6 text-sm text-muted-foreground">
                                Location: {groupData.location}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Filament Dialog */}
      {editingFilament && (
        <Dialog open={!!editingFilament} onOpenChange={() => setEditingFilament(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Filament</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="edit-used">Used (g)</Label>
                  <Input
                    id="edit-used"
                    type="number"
                    value={editingFilament.used}
                    onChange={(e) => setEditingFilament({
                      ...editingFilament,
                      used: parseInt(e.target.value)
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={editingFilament.status} 
                    onValueChange={(value: FilamentInventoryItem['status']) => setEditingFilament({
                      ...editingFilament,
                      status: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="partially-used">Partially Used</SelectItem>
                      <SelectItem value="empty">Empty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editingFilament.location || ''}
                  onChange={(e) => setEditingFilament({
                    ...editingFilament,
                    location: e.target.value
                  })}
                  placeholder="Storage location"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingFilament(null)}>Cancel</Button>
              <Button onClick={handleUpdateFilament}>Update Filament</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
