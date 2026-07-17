import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProduct, getListProductsQueryKey, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Loader2, Image as ImageIcon } from "lucide-react";
import { z } from "zod";

const LOCALES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "es", label: "Spanish", dir: "ltr" },
  { code: "fr", label: "French", dir: "ltr" },
  { code: "zh", label: "Chinese", dir: "ltr" },
];

export default function ProductNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("en");

  // Form State
  const [names, setNames] = useState<Record<string, string>>({ en: "", ar: "", es: "", fr: "", zh: "" });
  const [descriptions, setDescriptions] = useState<Record<string, string>>({ en: "", ar: "", es: "", fr: "", zh: "" });
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [imageUrl, setImageUrl] = useState("");

  const createMut = useCreateProduct({
    mutation: {
      onSuccess: (newProduct) => {
        toast({ title: "Product created", description: "Successfully added to your catalog." });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setLocation(`/products/${newProduct.id}`);
      },
      onError: (err) => {
        toast({ title: "Failed to create", description: err.error || "An error occurred", variant: "destructive" });
      }
    }
  });

  const handleSave = () => {
    if (!names.en.trim()) {
      toast({ title: "Validation Error", description: "English name is required.", variant: "destructive" });
      setActiveTab("en");
      return;
    }
    if (!price || isNaN(Number(price))) {
      toast({ title: "Validation Error", description: "Please enter a valid price.", variant: "destructive" });
      return;
    }

    const cleanNames = Object.fromEntries(Object.entries(names).filter(([_, v]) => v.trim() !== ""));
    const cleanDescs = Object.fromEntries(Object.entries(descriptions).filter(([_, v]) => v.trim() !== ""));

    createMut.mutate({
      data: {
        name: cleanNames as any,
        description: Object.keys(cleanDescs).length > 0 ? (cleanDescs as any) : undefined,
        price: Number(price),
        currency: currency || "USD",
        imagePath: imageUrl.trim() || undefined,
      }
    });
  };

  const activeDir = LOCALES.find(l => l.code === activeTab)?.dir || "ltr";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/products")} className="h-8 w-8 rounded-full bg-white border shadow-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add Product</h1>
            <p className="text-gray-500 text-sm">Create a new item in your catalog.</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={createMut.isPending}>
          {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Product
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b bg-gray-50/50">
              <CardTitle className="text-base font-semibold">Localized Content</CardTitle>
              <CardDescription>Enter product details in multiple languages.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full justify-start h-auto p-1 mb-6 flex-wrap">
                  {LOCALES.map(locale => (
                    <TabsTrigger key={locale.code} value={locale.code} className="flex-1 sm:flex-none">
                      {locale.label} {locale.code === "en" && <span className="text-red-500 ml-1">*</span>}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                <div dir={activeDir} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Product Name</Label>
                    <Input 
                      id="name" 
                      value={names[activeTab]} 
                      onChange={(e) => setNames(prev => ({ ...prev, [activeTab]: e.target.value }))}
                      placeholder={activeTab === 'en' ? "e.g. Minimalist Chair" : ""}
                      className="max-w-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea 
                      id="desc" 
                      value={descriptions[activeTab]} 
                      onChange={(e) => setDescriptions(prev => ({ ...prev, [activeTab]: e.target.value }))}
                      placeholder="Describe the product details..."
                      rows={6}
                      className="max-w-xl resize-none"
                    />
                  </div>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b bg-gray-50/50">
              <CardTitle className="text-base font-semibold">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input 
                  id="price" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={price} 
                  onChange={(e) => setPrice(e.target.value)} 
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency Code</Label>
                <Input 
                  id="currency" 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())} 
                  placeholder="USD" 
                  maxLength={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4 border-b bg-gray-50/50">
              <CardTitle className="text-base font-semibold">Media</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {imageUrl ? (
                <div className="rounded-md border overflow-hidden aspect-square relative bg-white flex items-center justify-center">
                  <img src={imageUrl} alt="Preview" className="max-w-full max-h-full object-contain" onError={(e) => {
                    (e.target as HTMLImageElement).src = "";
                    toast({ title: "Invalid Image", description: "The URL provided could not be loaded.", variant: "destructive" });
                  }} />
                </div>
              ) : (
                <div className="rounded-md border-2 border-dashed border-gray-200 aspect-square flex flex-col items-center justify-center text-gray-500 bg-gray-50">
                  <ImageIcon className="h-8 w-8 mb-2 text-gray-400" />
                  <span className="text-sm font-medium">No image URL</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                <Input 
                  id="image" 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(e.target.value)} 
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}