<script lang="ts">
	import IconDatabase from '~icons/mdi/database';
	import IconKey from '~icons/mdi/key';
	import IconText from '~icons/mdi/text-box';
	import IconNumber from '~icons/mdi/numeric';
	import IconCalendar from '~icons/mdi/calendar';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';

	type AttributeType = 'key' | 'text' | 'number' | 'date';

	type EntityAttribute = {
		id: string;
		name: string;
		type: AttributeType;
		entityId: string;
	};

	type Entity = {
		id: string;
		name: string;
		attributes: EntityAttribute[];
	};

	// 假数据
	const entities: Entity[] = [
		{
			id: 'user',
			name: '用户',
			attributes: [
				{ id: 'user-id', name: 'ID', type: 'key', entityId: 'user' },
				{ id: 'user-name', name: '姓名', type: 'text', entityId: 'user' },
				{ id: 'user-email', name: '邮箱', type: 'text', entityId: 'user' },
				{ id: 'user-age', name: '年龄', type: 'number', entityId: 'user' },
				{ id: 'user-created', name: '创建时间', type: 'date', entityId: 'user' }
			]
		},
		{
			id: 'product',
			name: '产品',
			attributes: [
				{ id: 'product-id', name: 'ID', type: 'key', entityId: 'product' },
				{ id: 'product-name', name: '产品名称', type: 'text', entityId: 'product' },
				{ id: 'product-price', name: '价格', type: 'number', entityId: 'product' },
				{ id: 'product-stock', name: '库存', type: 'number', entityId: 'product' }
			]
		},
		{
			id: 'product2',
			name: '产品',
			attributes: [
				{ id: 'product-id2', name: 'ID', type: 'key', entityId: 'product' },
				{ id: 'product-name2', name: '产品名称', type: 'text', entityId: 'product' },
				{ id: 'product-price2', name: '价格', type: 'number', entityId: 'product' },
				{ id: 'product-stock2', name: '库存', type: 'number', entityId: 'product' }
			]
		}
	];

	// 模拟 store - 当前正在查看的属性（单选）
	let currentViewingId = $state<string | null>('user-name');

	// 模拟 store - 已打开的属性（多选）
	let openedAttributes = $state<Array<{ id: string }>>([
		{ id: 'user-id' },
		{ id: 'user-name' },
		{ id: 'product-name' }
	]);

	// 根据类型获取图标组件
	function getIconComponent(type: AttributeType) {
		const iconMap = {
			key: IconKey,
			text: IconText,
			number: IconNumber,
			date: IconCalendar
		};
		return iconMap[type];
	}

	let expandedEntityIds = $state<Set<string>>(new Set(['user']));

	function toggleEntity(entityId: string) {
		const newSet = new Set(expandedEntityIds);
		if (newSet.has(entityId)) {
			newSet.delete(entityId);
		} else {
			newSet.add(entityId);
		}
		expandedEntityIds = newSet;
	}

	function handleAttributeClick(attributeId: string) {
		// 设置为当前正在查看
		currentViewingId = attributeId;

		// 如果不在已打开列表中，则添加
		const isOpened = openedAttributes.some((attr) => attr.id === attributeId);
		if (!isOpened) {
			openedAttributes = [...openedAttributes, { id: attributeId }];
		}
	}

	// 检查属性是否已打开
	function isAttributeOpened(attributeId: string): boolean {
		return openedAttributes.some((attr) => attr.id === attributeId);
	}

	// 检查属性是否为当前查看
	function isAttributeViewing(attributeId: string): boolean {
		return currentViewingId === attributeId;
	}

	// 检查实体是否有已打开的属性
	function hasOpenedAttributes(entity: Entity): boolean {
		return entity.attributes.some((attr) => isAttributeOpened(attr.id));
	}
</script>

<nav class="absolute inset-0 flex flex-col bg-surface-100 dark:bg-surface-800">
	<div class="flex-1 overflow-y-auto p-4">
		<div class="space-y-2">
			{#each entities as entity (entity.id)}
				{@const isExpanded = expandedEntityIds.has(entity.id)}
				{@const hasOpened = hasOpenedAttributes(entity)}

				<div class="space-y-1">
					<!-- 实体头部 -->
					<button
						type="button"
						onclick={() => toggleEntity(entity.id)}
						class="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5
                   text-sm font-medium transition-colors
                   {hasOpened
							? 'bg-primary-100 text-primary-900 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-100 dark:hover:bg-primary-900/40'
							: 'bg-surface-50 text-surface-900 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-100 dark:hover:bg-surface-600'}"
					>
						<IconChevronRight
							class="h-4 w-4 transition-transform
                     {hasOpened
								? 'text-primary-600 dark:text-primary-400'
								: 'text-surface-600 dark:text-surface-400'}
                     {isExpanded ? 'rotate-90' : ''}"
						/>
						<IconDatabase
							class="h-4 w-4
                     {hasOpened
								? 'text-primary-600 dark:text-primary-400'
								: 'text-surface-600 dark:text-surface-400'}"
						/>
						<span>{entity.name}</span>
					</button>

					<!-- 属性列表 -->
					{#if isExpanded}
						<div class="relative pl-6">
							<!-- 竖向连接线 -->
							<div
								class="absolute top-0 bottom-0 left-3 w-px
                       {hasOpened
									? 'bg-primary-300 dark:bg-primary-700'
									: 'bg-surface-300 dark:bg-surface-600'}"
							></div>

							<div class="space-y-0.5">
								{#each entity.attributes as attribute (attribute.id)}
									{@const Icon = getIconComponent(attribute.type)}
									{@const isOpened = isAttributeOpened(attribute.id)}
									{@const isViewing = isAttributeViewing(attribute.id)}

									<div class="relative">
										<!-- 横向连接线 -->
										<div
											class="absolute top-1/2 left-[-12px] h-px w-3
                               {isOpened
												? 'bg-primary-300 dark:bg-primary-700'
												: 'bg-surface-300 dark:bg-surface-600'}"
										></div>

										<button
											type="button"
											onclick={() => handleAttributeClick(attribute.id)}
											class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm
           transition-colors
           {isViewing
												? 'bg-primary-500 text-white'
												: isOpened
													? 'bg-primary-100 text-primary-900 hover:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-100 dark:hover:bg-primary-900/30'
													: 'text-surface-900 hover:bg-surface-200 dark:text-surface-100 dark:hover:bg-surface-700'}"
										>
											<!-- 类型图标 -->
											<Icon
												class="h-4 w-4 flex-shrink-0
             {isViewing
													? 'text-white'
													: isOpened
														? 'text-primary-600 dark:text-primary-400'
														: 'text-surface-500 dark:text-surface-400'}"
											/>

											<!-- 属性名称 -->
											<span class="flex-1 truncate text-left">{attribute.name}</span>

											<!-- 状态指示器 -->
											<div class="flex h-4 w-4 flex-shrink-0 items-center justify-center">
												{#if isViewing}
													<IconCircleFilled class="h-4 w-4 text-white" />
												{:else if isOpened}
													<IconCircle class="h-4 w-4 text-primary-600 dark:text-primary-400" />
												{:else}
													<IconCircle class="h-4 w-4 text-surface-400 dark:text-surface-500" />
												{/if}
											</div>
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</nav>
