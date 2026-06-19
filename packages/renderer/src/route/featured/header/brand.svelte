<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Tooltip from "$lib/components/ui/tooltip";

  const handleClick = () => {
    push("/");
  };
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        id="home-control"
        onclick={handleClick}
        class="group ml-3 flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white transition-all duration-200 hover:scale-110 hover:shadow-lg active:scale-95"
      >
        <img
          src="data:image/png;base64,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"
          alt="icon"
          class="transition-transform duration-200 group-hover:rotate-12"
        />
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="z-200">回到控制台</Tooltip.Content>
</Tooltip.Root>
