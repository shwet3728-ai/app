# Docker and Kubernetes

## Docker

Build and run:

```bash
docker compose up --build
```

The app will be available at `http://localhost:3000`.

## Kubernetes

1. Pick your public domain first.

Example:

```text
coffee.example.com
```

Set the same domain in:

- `k8s/configmap.yaml` as `APP_URL`
- `k8s/configmap.yaml` as the Google and Facebook redirect URIs
- `k8s/ingress.yaml` as the ingress host and TLS host
- Razorpay dashboard webhook/callback settings if required by your account setup
- Google and Facebook OAuth app settings

2. Build the image:

```bash
docker build -t shwets-coffee-shop:latest .
```

3. If your cluster cannot use local Docker images, push the image to your registry and update `image:` in `deployment.yaml`.

For Minikube, load the image into the cluster after building it:

```bash
minikube image load shwets-coffee-shop:latest
```

4. Update `configmap.yaml` and `secret.yaml` with your real values, especially `JWT_SECRET`, Razorpay keys, and OAuth client secrets.

5. Create or connect an ingress controller.

For Minikube:

```bash
minikube addons enable ingress
```

6. Create TLS for the public domain.

For a simple static TLS secret:

```bash
kubectl create secret tls coffee-app-tls \
  --cert=/path/to/tls.crt \
  --key=/path/to/tls.key
```

If you use cert-manager, keep the same `secretName` or update `ingress.yaml`.

7. Apply the manifests:

```bash
kubectl apply -f k8s/
```

8. Point DNS for your public domain to the ingress controller IP.

Check the ingress address:

```bash
kubectl get ingress coffee-app
```

9. Expose locally for testing only if you are not using the public domain yet:

```bash
kubectl port-forward service/coffee-app 3000:3000
```

The app uses SQLite, so the Kubernetes deployment is intentionally single replica with a persistent volume claim.

## Production notes

- Keep `replicas: 1` unless you move from SQLite to a network database.
- For Razorpay redirect flow, `APP_URL` must be the exact public HTTPS URL served by ingress.
- Update Google and Facebook OAuth dashboards so their callback URLs match the public HTTPS URLs in `configmap.yaml`.
- Replace placeholder secrets before exposing the app publicly.
