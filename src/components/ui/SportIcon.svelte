<script>
  import Run from '../icons/Run.svelte';
  import Ride from '../icons/Ride.svelte';
  import Walk from '../icons/Walk.svelte';
  import Swim from '../icons/Swim.svelte';
  import More from '../icons/More.svelte';

  const ICONS = { run: Run, ride: Ride, walk: Walk, swim: Swim, other: More };
  let { sp, size = 22 } = $props();
  const Icon = $derived(ICONS[sp] ?? More);
</script>

<Icon {size} />
