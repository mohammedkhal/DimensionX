import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListProducts, usePreviewImport, useImportProducts, getListProductsQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { ImportSource, ConversionStatus, ProductSource } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Download, ExternalLink, Box, Loader2, RefreshCw, Package } from "lucide-react";
import { format } from "date-fns";

function ImportModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [source, setSource] = useState<ImportSource | "">("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: previewData, isLoading: previewLoading } = usePreviewImport(
    { source: source as ImportSource },
    { query: { enabled: !!source && open, queryKey: ["previewImport", source] } }
  );

  const importMut = useImportProducts({
    mutation: {
      onSuccess: (res) => {
        toast({ title: "Import successful", description: `Imported ${res.imported} products. Skipped ${res.skipped}.` });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        onOpenChange(false);
        setSource("");
        setSelectedIds(new Set());
      },
      onError: (err) => {
        toast({ title: "Import failed", description: err.error || "An error occurred", variant: "destructive" });
      }
    }
  });

  const handleImport = () => {
    if (!source) return;
    importMut.mutate({
      data: {
        source: source as ImportSource,
        externalIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
      }
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!previewData) return;
    if (checked) {
      setSelectedIds(new Set(previewData.products.map(p => p.externalId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
          <DialogDescription>Sync products from your external e-commerce platform.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Source Platform</label>
            <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose platform..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="salla">Salla</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source && previewLoading && (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {source && previewData && !previewLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Found {previewData.products.length} products</h4>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="select-all" 
                    checked={selectedIds.size === previewData.products.length && previewData.products.length > 0}
                    onCheckedChange={toggleAll}
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">Select All</label>
                </div>
              </div>

              <div className="border rounded-md divide-y">
                {previewData.products.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No products found to import.</div>
                ) : (
                  previewData.products.map(p => (
                    <div key={p.externalId} className="p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                      <Checkbox 
                        id={`import-${p.externalId}`}
                        checked={selectedIds.has(p.externalId)}
                        onCheckedChange={(c) => toggleOne(p.externalId, !!c)}
                      />
                      {p.imageUrl ? (
                        <div className="h-10 w-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Package className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`import-${p.externalId}`} className="text-sm font-medium text-gray-900 truncate cursor-pointer block">{p.name}</label>
                        <div className="text-xs text-gray-500 truncate">{p.price} {p.currency}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            disabled={!source || !previewData || importMut.isPending} 
            onClick={handleImport}
          >
            {importMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {selectedIds.size > 0 ? selectedIds.size : previewData?.products.length || 0} Products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Products() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversionStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ProductSource | "all">("all");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);

  const queryParams = useMemo(() => {
    const params: any = { page, limit: 20 };
    if (search) params.search = search;
    if (statusFilter !== "all") params.conversionStatus = statusFilter;
    if (sourceFilter !== "all") params.source = sourceFilter;
    return params;
  }, [search, statusFilter, sourceFilter, page]);

  const { data, isLoading } = useListProducts(queryParams, { 
    query: { queryKey: getListProductsQueryKey(queryParams) } 
  });

  const getStatusBadge = (status: ConversionStatus) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">Ready</Badge>;
      case "pending": return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50"><RefreshCw className="mr-1 h-3 w-3 animate-spin"/> Processing</Badge>;
      case "failed": return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">Failed</Badge>;
      case "idle": return <Badge variant="outline" className="text-gray-500 bg-gray-50">No Model</Badge>;
      default: return null;
    }
  };

  const getSourceBadge = (source: ProductSource) => {
    switch (source) {
      case "shopify": return <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">Shopify</Badge>;
      case "salla": return <Badge variant="outline" className="border-teal-200 text-teal-700 bg-teal-50">Salla</Badge>;
      case "manual": return <Badge variant="outline" className="border-gray-200 text-gray-700 bg-gray-50">Manual</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Product Catalog</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your products and their 3D AR models.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="bg-white">
            <Download className="mr-2 h-4 w-4" /> Import
          </Button>
          <Link href="/products/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4 items-center bg-gray-50/50">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search products..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 bg-white"
            />
          </div>
          <div className="flex flex-1 items-center gap-2 w-full sm:w-auto sm:justify-end">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px] bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Ready (3D)</SelectItem>
                <SelectItem value="pending">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="idle">No Model</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as any); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px] bg-white">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="salla">Salla</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Product Info</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>3D Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-10 w-10 bg-gray-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-48 bg-gray-100 rounded animate-pulse mb-2" /><div className="h-3 w-24 bg-gray-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-gray-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-gray-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-8 w-8 bg-gray-100 rounded animate-pulse ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Package className="h-10 w-10 mb-3 text-gray-300" />
                      <p className="text-base font-medium text-gray-900">No products found</p>
                      <p className="text-sm mt-1">Add a product manually or import from a platform.</p>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>Import</Button>
                        <Link href="/products/new"><Button size="sm">Add Product</Button></Link>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((product) => (
                  <TableRow key={product.id} className="group hover:bg-gray-50/50">
                    <TableCell>
                      {product.imagePath ? (
                        <div className="h-12 w-12 rounded overflow-hidden border border-gray-100 bg-white">
                          <img src={product.imagePath} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded border border-gray-100 bg-gray-50 flex items-center justify-center">
                          <Package className="h-5 w-5 text-gray-300" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">{product.name.en}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[250px]">
                        Added {format(new Date(product.createdAt), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-gray-700">
                      {product.price.toLocaleString(undefined, { style: 'currency', currency: product.currency || 'USD' })}
                    </TableCell>
                    <TableCell>{getSourceBadge(product.source)}</TableCell>
                    <TableCell>{getStatusBadge(product.conversionStatus)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/products/${product.id}`}>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          View details <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {data && data.totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between text-sm text-gray-500 bg-gray-50/50">
            <div>
              Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === data.totalPages}
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <ImportModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}