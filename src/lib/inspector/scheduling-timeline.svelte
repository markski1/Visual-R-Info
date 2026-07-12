<script module lang="ts">
	export interface SchedulingEntry {
		readonly step: number;
		readonly robotId: string;
		readonly line: number;
		readonly instruction: string;
		readonly outcome?: string;
	}
</script>

<script lang="ts">
	let {
		entries = [],
		robotCount = 0
	}: {
		entries?: readonly SchedulingEntry[];
		robotCount?: number;
	} = $props();

	const visibleEntries = $derived(entries.slice(-40));
</script>

<details class="border-border bg-muted/30 mt-4 rounded-md border p-3">
	<summary class="cursor-pointer text-xs font-semibold">
		Concurrencia y scheduler {entries.length ? `· ${entries.length} pasos` : ''}
	</summary>
	{#if robotCount < 2}
		<p class="text-muted-foreground mt-2 text-xs leading-relaxed">
			Esta vista cobra sentido cuando hay dos o más robots: muestra qué robot recibió cada turno.
		</p>
	{:else if visibleEntries.length}
		<ol class="mt-3 space-y-2 text-xs">
			{#each visibleEntries as entry (`${entry.step}:${entry.robotId}`)}
				<li class="border-border border-l-2 pl-2">
					<div class="flex items-baseline justify-between gap-2">
						<span class="font-semibold">Paso {entry.step} · {entry.robotId}</span>
						<span class="text-muted-foreground shrink-0">línea {entry.line}</span>
					</div>
					<p class="font-mono text-[11px] break-all">{entry.instruction}</p>
					{#if entry.outcome}
						<p class="text-muted-foreground mt-0.5 text-[11px]">{entry.outcome}</p>
					{/if}
				</li>
			{/each}
		</ol>
		{#if entries.length > visibleEntries.length}
			<p class="text-muted-foreground mt-2 text-[11px]">
				Mostrando los últimos {visibleEntries.length} turnos.
			</p>
		{/if}
	{:else}
		<p class="text-muted-foreground mt-2 text-xs">
			Ejecutá o avanzá un paso para iniciar la traza.
		</p>
	{/if}
</details>
