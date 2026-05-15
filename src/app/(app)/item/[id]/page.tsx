type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div>
      <h1 className="font-serif text-2xl text-stone-900 dark:text-stone-50">Item</h1>
      <p className="mt-2 font-mono text-xs text-stone-500">{id}</p>
    </div>
  );
}
