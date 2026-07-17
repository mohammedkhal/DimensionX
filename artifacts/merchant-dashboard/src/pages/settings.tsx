import { useState, useEffect } from "react";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, User as UserIcon, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const LOCALES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic (العربية)" },
  { code: "es", label: "Spanish (Español)" },
  { code: "fr", label: "French (Français)" },
  { code: "zh", label: "Chinese (中文)" },
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useGetMe();

  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("");

  // Initialize form when data loads
  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName || "");
      setLocale(me.locale || "en");
    }
  }, [me]);

  const updateMut = useUpdateMe({
    mutation: {
      onSuccess: (updatedMe) => {
        toast({ title: "Settings saved", description: "Your profile has been updated." });
        // Update cache immediately and also invalidate to trigger a refetch
        queryClient.setQueryData(getGetMeQueryKey(), updatedMe);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.error || "An error occurred", variant: "destructive" });
      }
    }
  });

  const handleSave = () => {
    updateMut.mutate({
      data: {
        displayName: displayName.trim() || undefined,
        locale: locale as any,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your merchant profile and preferences.</p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDirty = (me?.displayName || "") !== displayName || (me?.locale || "en") !== locale;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your merchant profile and preferences.</p>
      </div>

      <Card>
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-gray-500" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your display name and default language settings.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="email" className="text-gray-500">Email Address</Label>
            <Input id="email" value={me?.email || ""} disabled className="bg-gray-50 text-gray-500 cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">To change your email, use the account manager in the sidebar.</p>
          </div>

          <div className="space-y-2 max-w-md">
            <Label htmlFor="displayName">Display Name</Label>
            <Input 
              id="displayName" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
              placeholder="e.g. Acme Corporation" 
            />
          </div>

          <div className="space-y-2 max-w-md">
            <Label htmlFor="locale" className="flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-gray-400" /> Default Language
            </Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger id="locale">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              This determines the default tab when editing products, and changes layout direction for Arabic.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-gray-50/50 flex justify-end py-4">
          <Button onClick={handleSave} disabled={!isDirty || updateMut.isPending}>
            {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}