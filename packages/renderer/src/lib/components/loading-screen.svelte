<!-- src/lib/components/loading-screen.svelte -->
<script lang="ts">
  import { Motion } from "svelte-motion";

  // 可由外部传入提示文案与步骤，默认值保证独立可运行
  let {
    message = "系统初始化中，请稍候",
    steps = [
      "连接核心服务",
      "加载用户配置",
      "同步运行环境",
      "准备就绪",
    ] as string[],
  } = $props();

  // 当前步骤索引（演示用，自动推进）
  let stepIndex = $state(0);

  // 自动轮播步骤，营造"进行中"的氛围
  $effect(() => {
    const timer = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
    }, 1400);
    return () => clearInterval(timer);
  });

  // 装饰性流动光斑配置
  const orbs = [
    {
      size: 340,
      x: -120,
      y: -80,
      delay: 0,
      color: "from-sky-400/30 to-indigo-500/20",
    },
    {
      size: 260,
      x: 160,
      y: 120,
      delay: 0.6,
      color: "from-fuchsia-400/25 to-purple-500/15",
    },
    {
      size: 200,
      x: 60,
      y: -160,
      delay: 1.2,
      color: "from-emerald-400/25 to-teal-500/15",
    },
  ];
</script>

<div
  class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden
         bg-linear-to-b from-slate-50 via-white to-slate-100
         dark:from-slate-950 dark:via-slate-900 dark:to-black"
>
  <!-- 背景流动光斑 -->
  {#each orbs as orb (orb.delay)}
    <Motion
      let:motion
      animate={{
        x: [orb.x, orb.x + 30, orb.x],
        y: [orb.y, orb.y - 40, orb.y],
        scale: [1, 1.15, 1],
        opacity: [0.6, 0.9, 0.6],
      }}
      transition={{
        duration: 6,
        delay: orb.delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <div
        use:motion
        class="pointer-events-none absolute rounded-full bg-linear-to-br blur-3xl {orb.color}"
        style="width:{orb.size}px;height:{orb.size}px;"
      ></div>
    </Motion>
  {/each}

  <!-- 中心内容 -->
  <div class="relative z-10 flex flex-col items-center gap-8 px-6">
    <!-- 旋转双环 + 脉冲核心 -->
    <div class="relative grid place-items-center">
      <!-- 外环 -->
      <Motion
        let:motion
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
      >
        <div
          use:motion
          class="h-24 w-24 rounded-full border-[3px] border-transparent
                 border-t-sky-500 border-r-sky-400/60
                 sm:h-28 sm:w-28 dark:border-t-sky-400 dark:border-r-sky-300/50"
        ></div>
      </Motion>

      <!-- 内环（反向旋转） -->
      <Motion
        let:motion
        animate={{ rotate: -360 }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
      >
        <div
          use:motion
          class="absolute h-16 w-16 rounded-full border-[3px] border-transparent
                 border-b-indigo-500 border-l-indigo-400/60
                 sm:h-20 sm:w-20 dark:border-b-indigo-400 dark:border-l-indigo-300/50"
        ></div>
      </Motion>

      <!-- 脉冲核心 -->
      <Motion
        let:motion
        animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          use:motion
          class="absolute h-6 w-6 rounded-full bg-linear-to-br from-sky-400 to-indigo-500
                 shadow-lg shadow-sky-500/40 sm:h-7 sm:w-7"
        ></div>
      </Motion>
    </div>

    <!-- 标题文案 + 跳动省略号 -->
    <div class="flex flex-col items-center gap-2 text-center">
      <h1
        class="flex items-center text-xl font-semibold tracking-wide
               text-slate-800 sm:text-2xl dark:text-slate-100"
      >
        {message}
        <span class="ml-0.5 inline-flex">
          {#each [0, 1, 2] as dot (dot)}
            <Motion
              let:motion
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
              transition={{
                duration: 1.2,
                delay: dot * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <span use:motion class="inline-block">.</span>
            </Motion>
          {/each}
        </span>
      </h1>

      <!-- 当前步骤提示（切换时上下滑入） -->
      <div class="relative h-6 overflow-hidden">
        {#key stepIndex}
          <Motion
            let:motion
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <p
              use:motion
              class="text-sm text-slate-500 sm:text-base dark:text-slate-400"
            >
              {steps[stepIndex]}
            </p>
          </Motion>
        {/key}
      </div>
    </div>

    <!-- 进度条（不确定态，循环扫动） -->
    <div
      class="relative h-1 w-48 overflow-hidden rounded-full bg-slate-200/70
             sm:w-64 dark:bg-slate-700/50"
    >
      <Motion
        let:motion
        animate={{ x: ["-100%", "250%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          use:motion
          class="h-full w-1/3 rounded-full
                 bg-linear-to-r from-transparent via-sky-500 to-transparent
                 dark:via-sky-400"
        ></div>
      </Motion>
    </div>
  </div>

  <!-- 底部品牌占位 -->
  <div
    class="absolute bottom-6 z-10 text-xs text-slate-400/80 dark:text-slate-600"
  >
    正在为您准备最佳体验
  </div>
</div>
