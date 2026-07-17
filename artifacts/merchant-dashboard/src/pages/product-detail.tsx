import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetProduct, 
  getGetProductQueryKey,
  useTriggerConversion,
  useGetEmbedCode,
  getGetEmbedCodeQueryKey,
  useDeleteProduct,
  useGetMe,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Box, Check, Copy, ExternalLink, Loader2, RefreshCw, Trash2, Code2 } from "lucide-react";
import { ConversionStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";

const LOCALES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "es", label: "Spanish", dir: "ltr" },
  { code: "fr", label: "French", dir: "ltr" },
  { code: "zh", label: "Chinese", dir: "ltr" },
];

function EmbedCodeModal({ productId, open, onOpenChange }: { productId: string, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const { data: embedData, isLoading } = useGetEmbedCode(productId, {
    query: {
      enabled: open,
      queryKey: getGetEmbedCodeQueryKey(productId)
    }
  });

  const handleCopy = () => {
    if (embedData?.html) {
      navigator.clipboard.writeText(embedData.html);
      setCopied(true);
      toast({ title: "Copied!", description: "Embed code copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Embed Code</DialogTitle>
          <DialogDescription>Copy this HTML snippet to embed the 3D model on your website.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : embedData?.html ? (
            <div className="relative group">
              <pre className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto text-sm font-mono border border-slate-800">
                <code>{embedData.html}</code>
              </pre>
              <Button 
                size="sm" 
                variant="secondary" 
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied" : "Copy snippet"}
              </Button>
            </div>
          ) : (
            <div className="p-4 text-center text-red-500 bg-red-50 rounded-md">Failed to load embed code.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const [activeTab, setActiveTab] = useState("en");
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [, setLocation] = useState("");

  // Default the active language tab to the merchant's saved locale
  useEffect(() => {
    if (me?.locale && LOCALES.some(l => l.code === me.locale)) {
      setActiveTab(me.locale);
    }
  }, [me?.locale]);

  const { data: product, isLoading, refetch } = useGetProduct(id || "", {
    query: {
      enabled: !!id,
      queryKey: getGetProductQueryKey(id || ""),
      refetchInterval: (query) => {
        // Poll every 3 seconds if status is pending
        return query.state.data?.conversionStatus === "pending" ? 3000 : false;
      }
    }
  });

  const triggerMut = useTriggerConversion({
    mutation: {
      onSuccess: () => {
        toast({ title: "Conversion Started", description: "Your 3D model is generating. This may take a few minutes." });
        queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(id || "") });
      },
      onError: (err) => {
        toast({ title: "Failed to trigger conversion", description: err.error || "An error occurred", variant: "destructive" });
      }
    }
  });

  const deleteMut = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        toast({ title: "Product deleted", description: "The product has been removed." });
        window.location.href = import.meta.env.BASE_URL + "products"; // hard redirect to clear cache state safely
      },
      onError: (err) => {
        toast({ title: "Failed to delete", description: err.error || "An error occurred", variant: "destructive" });
      }
    }
  });

  if (!id) return <div>Invalid ID</div>;

  if (isLoading) return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Skeleton className="h-10 w-1/3" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );

  if (!product) return (
    <div className="text-center py-20">
      <h2 className="text-xl font-bold text-gray-900">Product not found</h2>
      <p className="text-gray-500 mt-2">The product you are looking for does not exist.</p>
      <Link href="/products"><Button className="mt-4">Back to Products</Button></Link>
    </div>
  );

  const activeDir = LOCALES.find(l => l.code === activeTab)?.dir || "ltr";
  const localizedName = (product.name as any)?.[activeTab] || <span className="italic text-gray-400">Not provided</span>;
  const localizedDesc = (product.description as any)?.[activeTab] || <span className="italic text-gray-400">Not provided</span>;

  const renderConversionState = () => {
    switch (product.conversionStatus) {
      case "pending":
        return (
          <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-gray-200 border-dashed rounded-lg">
            <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Generating 3D Model</h3>
            <p className="text-sm text-gray-500 text-center max-w-sm mt-2">
              Our AI is processing the product images into a high-fidelity AR asset. This typically takes 2-5 minutes.
            </p>
          </div>
        );
      case "completed":
        return (
          <div className="bg-gray-100 rounded-lg overflow-hidden border relative h-[500px]">
            <model-viewer
              src={product.glbPath ? `/api${product.glbPath}` : undefined}
              ios-src={product.usdzPath ? `/api${product.usdzPath}` : undefined}
              alt={product.name.en}
              ar
              auto-rotate
              camera-controls
              shadow-intensity="1"
              style={{ width: "100%", height: "100%", backgroundColor: "#f8f9fa" }}
            />
            <div className="absolute bottom-4 right-4 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEmbedModalOpen(true)} className="bg-white/90 hover:bg-white shadow-sm">
                <Code2 className="h-4 w-4 mr-2" /> Embed
              </Button>
            </div>
          </div>
        );
      case "failed":
        return (
          <div className="flex flex-col items-center justify-center p-12 bg-red-50 border border-red-200 border-dashed rounded-lg">
            <Box className="h-12 w-12 text-red-400 mb-4" />
            <h3 className="text-lg font-bold text-red-900">Conversion Failed</h3>
            <p className="text-sm text-red-700 text-center max-w-sm mt-2 mb-6">
              We couldn't generate a 3D model for this product. Please ensure the image is high resolution and clearly shows the product.
            </p>
            <Button onClick={() => triggerMut.mutate({ id })} disabled={triggerMut.isPending} variant="outline" className="bg-white">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry Conversion
            </Button>
          </div>
        );
      case "idle":
      default:
        return (
          <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-gray-200 border-dashed rounded-lg">
            <Box className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">No 3D Model Yet</h3>
            <p className="text-sm text-gray-500 text-center max-w-sm mt-2 mb-6">
              Generate an immersive 3D AR asset from this product's 2D image to boost conversion rates.
            </p>
            <Button onClick={() => triggerMut.mutate({ id })} disabled={triggerMut.isPending}>
              {triggerMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Box className="mr-2 h-4 w-4" />}
              Start 3D Conversion
            </Button>
          </div>
        );
    }
  };

  const getStatusBadge = (status: ConversionStatus) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">AR Ready</Badge>;
      case "pending": return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50"><RefreshCw className="mr-1 h-3 w-3 animate-spin"/> Processing</Badge>;
      case "failed": return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">Failed</Badge>;
      case "idle": return <Badge variant="outline" className="text-gray-500 bg-gray-50">No Model</Badge>;
      default: return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/products">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white border shadow-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">{product.name.en}</h1>
              {getStatusBadge(product.conversionStatus)}
            </div>
            <p className="text-gray-500 text-sm mt-1 uppercase tracking-wider font-mono">ID: {product.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {product.conversionStatus === 'completed' && (
            <Button variant="outline" className="bg-white" onClick={() => setEmbedModalOpen(true)}>
              <Code2 className="mr-2 h-4 w-4" /> Embed Code
            </Button>
          )}
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100">
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Product?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete the product and its associated 3D models.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => deleteMut.mutate({ id })} disabled={deleteMut.isPending}>
                  {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Delete Permanently
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b bg-gray-50/50 pb-4">
              <CardTitle className="text-base">AR Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {renderConversionState()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-gray-50/50 pb-4">
              <CardTitle className="text-base">Product Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full justify-start h-auto p-1 mb-6 flex-wrap">
                  {LOCALES.map(locale => (
                    <TabsTrigger key={locale.code} value={locale.code} className="flex-1 sm:flex-none">
                      {locale.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                <div dir={activeDir} className="space-y-6 bg-gray-50/50 rounded-md p-4 border border-gray-100">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Localized Name</h4>
                    <p className="text-base font-medium text-gray-900">{localizedName}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{localizedDesc}</div>
                  </div>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b bg-gray-50/50 pb-4">
              <CardTitle className="text-base">Source Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {product.imagePath ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50 flex items-center justify-center">
                  <img src={product.imagePath} alt={product.name.en} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 aspect-square bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                  <Box className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm">No 2D Image</span>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-y-4 pt-2">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Price</h4>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {product.price.toLocaleString(undefined, { style: 'currency', currency: product.currency || 'USD' })}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Source</h4>
                  <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{product.source}</p>
                </div>
                {product.externalId && (
                  <div className="col-span-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase">External ID</h4>
                    <p className="text-sm font-mono text-gray-600 mt-1 break-all bg-gray-50 p-1.5 rounded border">{product.externalId}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EmbedCodeModal 
        productId={product.id} 
        open={embedModalOpen} 
        onOpenChange={setEmbedModalOpen} 
      />
    </div>
  );
}