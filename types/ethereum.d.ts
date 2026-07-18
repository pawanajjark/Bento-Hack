interface EthereumRequestArguments {
  method: string;
  params?: unknown[];
}

interface EthereumProvider {
  request<T = unknown>(args: EthereumRequestArguments): Promise<T>;
}

interface Window {
  ethereum?: EthereumProvider;
}
