<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { Clock } from 'svelte-loading-spinners';
	import IconView from '~icons/carbon/view';
	import IconViewOff from '~icons/carbon/view-off';
	import IconInformation from '~icons/carbon/information';
	// import { Collapsible } from '@skeletonlabs/skeleton-svelte';
	import { Collapsible } from 'bits-ui';
	import IconMdiChevronDown from '~icons/mdi/chevron-down';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
	import type { BasicAuth, ProxyConfig } from '$lib/utils/proxy';

	let isOpen = $state(false);

	interface Props {
		initialData?: Partial<ProxyConfig>;
		onSave: (config: ProxyConfig) => Promise<void>;
		onCancel: () => void;
	}

	let { initialData, onSave, onCancel }: Props = $props();

	// Schema 定义
	const proxySchema = z
		.object({
			protocol: z.enum(['http', 'https', 'socks4', 'socks5']),
			host: z
				.string()
				.min(1, '请输入主机地址')
				.regex(
					/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/,
					'请输入有效的主机名或 IP 地址'
				),
			port: z.coerce.number().int().min(1, '端口范围: 1-65535').max(65535, '端口范围: 1-65535'),
			target: z.string().optional(),
			username: z.string().optional(),
			password: z.string().optional(),
			connectTimeout: z.coerce.number().int().min(0).max(300).optional(),
			acceptInvalidCerts: z.boolean(),
			acceptInvalidHostnames: z.boolean()
		})
		.refine(
			(data) => {
				// 如果有 username，就必须非空
				if (data.username !== undefined && data.username !== '') {
					return data.username.trim().length > 0;
				}
				return true;
			},
			{
				message: '用户名不能为空',
				path: ['username']
			}
		);

	type ProxyFormData = z.infer<typeof proxySchema>;

	const defaultHost = '127.0.0.1';
	const defaultPort = 7890;

	// 从 URL 解析初始值
	const parseInitialData = () => {
		let protocol: 'http' | 'https' | 'socks4' | 'socks5' = 'http';
		let host = defaultHost;
		let port = defaultPort;

		if (initialData?.url) {
			try {
				const u = new URL(initialData.url);
				protocol = u.protocol.replace(':', '') as typeof protocol;
				host = u.hostname;
				port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
			} catch {
				// 使用默认值
			}
		}

		return {
			protocol,
			host,
			port,
			username: initialData?.basicAuth?.username ?? '',
			password: initialData?.basicAuth?.password ?? '',
			target: initialData?.target ?? '',
			connectTimeout: initialData?.connectTimeout ?? 10,
			acceptInvalidCerts: initialData?.acceptInvalidCerts ?? false,
			acceptInvalidHostnames: initialData?.acceptInvalidHostnames ?? false
		};
	};

	const { form, enhance, errors, delayed, validateForm } = superForm<ProxyFormData>(
		parseInitialData(),
		{
			SPA: true,
			validators: zodClient(proxySchema as any),
			dataType: 'json',
			resetForm: false,
			async onSubmit({ cancel }) {
				const validInfo = await validateForm();
				if (!validInfo.valid) {
					cancel();
					return;
				}

				const proxyUrl = `${$form.protocol}://${$form.host}:${$form.port}`;
				const config: ProxyConfig = {
					id: initialData?.id ?? crypto.randomUUID(),
					url: proxyUrl,
					basicAuth:
						$form.username && $form.username.trim()
							? ({ username: $form.username, password: $form.password } as BasicAuth)
							: undefined,
					connectTimeout: $form.connectTimeout,
					acceptInvalidCerts: $form.acceptInvalidCerts,
					acceptInvalidHostnames: $form.acceptInvalidHostnames,
					target: $form.target || '',
					enabled: true
				};

				try {
					const result = await tauriFetch('https://www.baidu.com', {
						proxy: {
							all: {
								url: proxyUrl
							}
						}
					});
					console.log(result);
				} catch (e) {
					console.error('链接错误:', e);
					errors.set({
						host: [`无法连接:${e}`]
					});

					cancel();
					return;
				}

				await onSave(config);
			}
		}
	);

	let showPassword = $state(false);

	// 构建预览 URL
	let previewUrl = $derived.by(() => {
		try {
			return `${$form.protocol}://${$form.host}:${$form.port}`;
		} catch {
			return '—';
		}
	});
</script>

<form method="POST" use:enhance class="space-y-6">
	<!-- URL 构建器（一行式） -->
	<div class="form-section">
		<div class="section-label-wrapper">
			<span class="section-label">代理地址</span>
		</div>
		<div class="url-builder">
			<select name="protocol" bind:value={$form.protocol} class="protocol-select">
				<option value="http">HTTP</option>
				<option value="https">HTTPS</option>
				<option value="socks4">SOCKS4</option>
				<option value="socks5">SOCKS5</option>
			</select>
			<span class="url-separator">://</span>
			<input
				name="host"
				type="text"
				bind:value={$form.host}
				class="host-input"
				class:input-error={$errors.host}
				placeholder="主机名或 IP"
				aria-label="主机地址"
			/>
			<span class="url-separator">:</span>
			<input
				name="port"
				type="number"
				min="1"
				max="65535"
				bind:value={$form.port}
				class="port-input"
				class:input-error={$errors.port}
				aria-label="端口号"
			/>
		</div>
		<div class="error-container">
			{#if $errors.host}
				<span class="error-message"
					>{Array.isArray($errors.host) ? $errors.host[0] : String($errors.host)}</span
				>
			{/if}
			{#if $errors.port}
				<span class="error-message"
					>{Array.isArray($errors.port) ? $errors.port[0] : String($errors.port)}</span
				>
			{/if}
		</div>
		<div class="preview-url">
			<IconInformation class="preview-icon" />
			<span class="preview-text">{previewUrl}</span>
		</div>

		<div class="form-field">
			<label class="field-label" for="target">
				<span>目标地址</span>
			</label>
			<input
				id="target"
				name="target"
				type="text"
				bind:value={$form.target}
				class="input"
				class:input-error={$errors.target}
				placeholder="host列表(;分割)"
			/>
			<div class="error-container">
				{#if $errors.target}
					<span class="error-message">
						{Array.isArray($errors.target) ? $errors.target[0] : String($errors.target)}
					</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- 高级设置 Accordion -->

	<Collapsible.Root bind:open={isOpen}>
		<Collapsible.Trigger class="btn flex w-full items-center justify-center gap-2 preset-filled">
			<span>高级设置</span>
			<IconMdiChevronDown
				class="transition-transform duration-300 ease-out"
				style="transform: rotate({isOpen ? 180 : 0}deg)"
			/>
		</Collapsible.Trigger>

		<Collapsible.Content>
			<div
				class="accordion-content overflow-hidden"
				transition:slide={{ duration: 300, easing: quintOut }}
			>
				<!-- Basic 认证 -->
				<div class="settings-group">
					<h4 class="group-title">Basic 认证（可选）</h4>
					<div class="form-fields-grid">
						<div class="form-field">
							<label class="field-label" for="username">
								<span>用户名</span>
							</label>
							<input
								id="username"
								name="username"
								type="text"
								bind:value={$form.username}
								class="input"
								class:input-error={$errors.username}
								placeholder="留空表示不使用认证"
							/>
							<div class="error-container">
								{#if $errors.username}
									<span class="error-message">
										{Array.isArray($errors.username)
											? $errors.username[0]
											: String($errors.username)}
									</span>
								{/if}
							</div>
						</div>

						<div class="form-field">
							<label class="field-label" for="password">
								<span>密码</span>
							</label>
							<div class="password-wrapper">
								<input
									id="password"
									name="password"
									type={showPassword ? 'text' : 'password'}
									bind:value={$form.password}
									class="input pr-10"
									class:input-error={$errors.password}
									placeholder="可选"
									disabled={!$form.username}
								/>
								<button
									type="button"
									onclick={() => (showPassword = !showPassword)}
									class="password-toggle"
									disabled={!$form.username}
									aria-label={showPassword ? '隐藏密码' : '显示密码'}
								>
									{#if showPassword}
										<IconViewOff class="h-5 w-5" />
									{:else}
										<IconView class="h-5 w-5" />
									{/if}
								</button>
							</div>
							<div class="error-container">
								{#if $errors.password}
									<span class="error-message">
										{Array.isArray($errors.password)
											? $errors.password[0]
											: String($errors.password)}
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- 连接选项 -->
				<div class="settings-group">
					<h4 class="group-title">连接选项</h4>
					<div class="form-fields-grid">
						<label class="field-label" for="connectTimeout">
							<span>连接超时</span>
							<div class="flex items-center gap-2">
								<input
									id="connectTimeout"
									name="connectTimeout"
									type="number"
									min="0"
									max="300"
									bind:value={$form.connectTimeout}
									class="input w-24"
								/>
								<span class="timeout-unit">秒</span>
							</div>
						</label>
					</div>
				</div>

				<!-- SSL 选项 -->
				<div class="settings-group">
					<h4 class="group-title">SSL 选项</h4>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input
								type="checkbox"
								name="acceptInvalidCerts"
								bind:checked={$form.acceptInvalidCerts}
								class="checkbox"
							/>
							<span>接受无效 SSL 证书</span>
						</label>

						<label class="checkbox-label">
							<input
								type="checkbox"
								name="acceptInvalidHostnames"
								bind:checked={$form.acceptInvalidHostnames}
								class="checkbox"
							/>
							<span>接受无效主机名</span>
						</label>
					</div>
				</div>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<footer class="form-footer">
		<button type="button" onclick={onCancel} class="btn preset-outlined" disabled={$delayed}>
			取消
		</button>
		<button type="submit" class="btn min-w-[100px] preset-filled" disabled={$delayed}>
			{#if $delayed}
				<Clock size="20" color="#ffffff" unit="px" duration="1s" />
			{:else}
				保存配置
			{/if}
		</button>
	</footer>
</form>

<style>
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-label-wrapper {
		display: flex;
	}

	.section-label {
		font-weight: 600;
		font-size: 0.875rem;
		color: rgb(39 39 42);
	}

	:global(.dark) .section-label {
		color: rgb(228 228 231);
	}

	/* URL 构建器 */
	.url-builder {
		display: flex;
		align-items: stretch;
		border: 1px solid rgb(228 228 231);
		border-radius: 0.5rem;
		overflow: hidden;
		background-color: rgb(255 255 255);
		transition: all 0.15s ease;
	}

	.url-builder:focus-within {
		border-color: rgb(99 102 241);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
	}

	:global(.dark) .url-builder {
		border-color: rgb(63 63 70);
		background-color: rgb(24 24 27);
	}

	:global(.dark) .url-builder:focus-within {
		border-color: rgb(129 140 248);
		box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
	}

	.protocol-select,
	.host-input,
	.port-input {
		border: none;
		outline: none;
		padding: 0.625rem 0.75rem;
		font-size: 0.875rem;
		background-color: transparent;
		color: rgb(24 24 27);
	}

	:global(.dark) .protocol-select,
	:global(.dark) .host-input,
	:global(.dark) .port-input {
		color: rgb(228 228 231);
	}

	.protocol-select {
		flex-shrink: 0;
		width: 100px;
		cursor: pointer;
		font-weight: 500;
	}

	.host-input {
		flex: 1;
		min-width: 0;
	}

	.port-input {
		width: 80px;
		flex-shrink: 0;
		text-align: right;
	}

	.url-separator {
		display: flex;
		align-items: center;
		padding: 0 0.25rem;
		font-weight: 600;
		color: rgb(161 161 170);
		user-select: none;
	}

	:global(.dark) .url-separator {
		color: rgb(113 113 122);
	}

	.input-error {
		background-color: rgb(254 242 242) !important;
	}

	:global(.dark) .input-error {
		background-color: rgba(153, 27, 27, 0.2) !important;
	}

	.preview-url {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background-color: rgb(249 250 251);
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		color: rgb(75 85 99);
		font-family: ui-monospace, monospace;
	}

	:global(.dark) .preview-url {
		background-color: rgb(39 39 42);
		color: rgb(168 162 158);
	}

	.preview-text {
		word-break: break-all;
	}

	.accordion-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
	}

	.settings-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.group-title {
		font-weight: 600;
		font-size: 0.8125rem;
		color: rgb(63 63 70);
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	:global(.dark) .group-title {
		color: rgb(161 161 170);
	}

	.form-fields-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: rgb(63 63 70);
	}

	:global(.dark) .field-label {
		color: rgb(212 212 216);
	}

	.input {
		width: 100%;
		padding: 0.625rem 0.75rem;
		border: 1px solid rgb(228 228 231);
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background-color: rgb(255 255 255);
		color: rgb(24 24 27);
		transition: all 0.15s ease;
	}

	.input:focus {
		outline: none;
		border-color: rgb(99 102 241);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
	}

	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background-color: rgb(249 250 251);
	}

	:global(.dark) .input {
		border-color: rgb(63 63 70);
		background-color: rgb(24 24 27);
		color: rgb(228 228 231);
	}

	:global(.dark) .input:focus {
		border-color: rgb(129 140 248);
		box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
	}

	:global(.dark) .input:disabled {
		background-color: rgb(39 39 42);
	}

	.password-wrapper {
		position: relative;
	}

	.password-toggle {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		display: flex;
		align-items: center;
		padding: 0 0.75rem;
		color: rgb(113 113 122);
		transition: color 0.15s ease;
	}

	.password-toggle:hover:not(:disabled) {
		color: rgb(39 39 42);
	}

	.password-toggle:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	:global(.dark) .password-toggle {
		color: rgb(161 161 170);
	}

	:global(.dark) .password-toggle:hover:not(:disabled) {
		color: rgb(228 228 231);
	}

	.timeout-unit {
		font-size: 0.875rem;
		color: rgb(113 113 122);
	}

	:global(.dark) .timeout-unit {
		color: rgb(161 161 170);
	}

	.checkbox-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: rgb(63 63 70);
		cursor: pointer;
		user-select: none;
	}

	:global(.dark) .checkbox-label {
		color: rgb(212 212 216);
	}

	.checkbox {
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		border: 1px solid rgb(212 212 216);
		cursor: pointer;
		accent-color: rgb(99 102 241);
	}

	:global(.dark) .checkbox {
		border-color: rgb(82 82 91);
		accent-color: rgb(129 140 248);
	}

	/* 错误信息 */
	.error-container {
		min-height: 1.25rem;
	}

	.error-message {
		display: block;
		font-size: 0.8125rem;
		line-height: 1.25rem;
		color: rgb(239 68 68);
		animation: errorFadeIn 0.2s ease-in-out;
	}

	@keyframes errorFadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.dark) .error-message {
		color: rgb(248 113 113);
	}

	/* Footer */
	.form-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1.5rem;
		margin-top: 1.5rem;
		border-top: 1px solid rgb(228 228 231);
	}

	:global(.dark) .form-footer {
		border-top-color: rgb(63 63 70);
	}
</style>
